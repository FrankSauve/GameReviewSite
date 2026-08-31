import { once } from "node:events";
import type { Readable } from "node:stream";
import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { ZipFile } from "yazl";

import { prisma } from "../lib/prisma.js";
import { readSession } from "../lib/session.js";
import {
  exportDirectory,
  exportFilename,
  formatReview,
  reviewEntryName,
} from "../lib/exportMarkdown.js";

/**
 * `GET /export/reviews.zip` — your own reviews, one markdown file each.
 *
 * Its own streaming endpoint rather than a GraphQL field, because the bounds in
 * lib/budget.ts would refuse a backlog of any size and an export is that shape
 * on purpose.
 *
 * A GET carrying the session cookie, so another site can trigger it. Acceptable
 * here and nowhere else: it changes nothing, and the response is opaque
 * cross-origin.
 */

/** Rows held in memory at once. Only one batch is resident: the loop waits for
 *  the archive to drain before reading the next. */
const BATCH_SIZE = 50;

/**
 * How much review text may queue before the next batch waits. yazl buffers what
 * it cannot yet write, so without this the read loop runs to completion at
 * memory speed and the whole backlog is resident.
 */
const QUEUE_HIGH_WATER = 1 << 20;

/** The last row of a batch, as the position the next one resumes from. */
interface Cursor {
  createdAt: Date;
  id: string;
}

/**
 * The zip being written to the response, with a queue the reader can wait on.
 * `pending` goes negative once the archive's own headers are counted out — it
 * is a watermark, not a ledger.
 */
class ArchiveWriter {
  private readonly zip = new ZipFile();
  private pending = 0;
  private drained: (() => void) | null = null;

  constructor(
    private readonly res: Response,
    gone: AbortSignal,
  ) {
    this.zip.outputStream.on("data", (chunk: Buffer) => {
      this.pending -= chunk.length;
      if (this.pending < QUEUE_HIGH_WATER) this.release();
    });
    this.zip.outputStream.pipe(res);
    // One listener for the writer's whole life. Registering it per wait would
    // pile up a listener per batch on an export long enough to need many.
    gone.addEventListener("abort", () => this.release(), { once: true });
  }

  add(name: string, body: string, mtime: Date): void {
    const buffer = Buffer.from(body, "utf8");
    this.pending += buffer.length;
    this.zip.addBuffer(buffer, name, { mtime });
  }

  /** Resolves once the queue has room, or immediately if the client has gone —
   *  the caller checks the signal, and an aborted wait would never be woken. */
  async waitForRoom(gone: AbortSignal): Promise<void> {
    if (this.pending < QUEUE_HIGH_WATER || gone.aborted) return;
    await new Promise<void>((resolve) => {
      this.drained = resolve;
    });
  }

  /**
   * Finishes the archive and resolves when the last byte has reached the wire,
   * or when the client leaves before it does — a "finish" that never comes
   * would otherwise hold the handler open for the life of the process.
   */
  async finish(gone: AbortSignal): Promise<void> {
    this.zip.end();
    if (this.res.writableEnded || gone.aborted) return;
    try {
      await once(this.res, "finish", { signal: gone });
    } catch {
      // Aborted: the socket is already gone, so there is nothing left to flush.
    }
  }

  /** Tears the response down mid-archive, leaving a truncated download that
   *  cannot be mistaken for a complete one. */
  abandon(): void {
    this.zip.outputStream.unpipe(this.res);
    // yazl types its output as the legacy readable interface; it is a Readable.
    (this.zip.outputStream as Readable).destroy();
    this.res.destroy();
  }

  private release(): void {
    const waiter = this.drained;
    this.drained = null;
    waiter?.();
  }
}

export function createExportRouter(): Router {
  const router = Router();

  router.get("/reviews.zip", async (req: Request, res: Response) => {
    const session = await readSession(req);
    if (!session) {
      res
        .status(401)
        .type("text/plain")
        .send("Sign in to export your reviews.\n");
      return;
    }

    // The user's own slug, not their username: authentik owns the username and
    // renames it, the slug is this app's and does not move. It is also already
    // url-safe, so it cannot inject a newline into the header — whereas the
    // username reaches us from authentik unconstrained.
    const filename = exportFilename(session.user.slug);
    const directory = exportDirectory(session.user.slug);

    res.type("application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // Someone else's export must never be served from a shared cache, and one's
    // own is stale the moment a review is written.
    res.setHeader("Cache-Control", "no-store");

    const departed = new AbortController();
    res.on("close", () => departed.abort());

    let archive: ArchiveWriter | null = null;
    try {
      const taken = new Set<string>();
      let cursor: Cursor | null = null;
      for (;;) {
        // Resume from the last row rather than counting past it. An offset is a
        // position in the result as it stands now, so a review written while the
        // export runs shifts every later row down one and the next batch repeats
        // one that is already in the file.
        const where: Prisma.ReviewWhereInput = {
          userId: session.user.id,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              }
            : {}),
        };
        const batch = await prisma.review.findMany({
          where,
          // Newest first, as the site reads. The id breaks ties because a
          // backlog imported in one go shares a `createdAt` to the millisecond,
          // and the cursor needs a total order to resume from.
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: BATCH_SIZE,
          select: {
            id: true,
            createdAt: true,
            rating: true,
            hoursPlayed: true,
            yearPlayed: true,
            platform: true,
            content: true,
            game: { select: { title: true } },
          },
        });
        // Opening the archive only once a read has succeeded leaves the status
        // line unspent for a database that is down, including for the very
        // first read. An account with no reviews still gets an empty archive.
        archive ??= new ArchiveWriter(res, departed.signal);
        if (batch.length === 0) break;

        for (const review of batch) {
          archive.add(
            reviewEntryName(directory, review.game.title, taken),
            formatReview({
              gameTitle: review.game.title,
              rating: review.rating,
              hoursPlayed: review.hoursPlayed,
              yearPlayed: review.yearPlayed,
              platform: review.platform,
              content: review.content,
            }),
            review.createdAt,
          );
        }

        await archive.waitForRoom(departed.signal);
        if (departed.signal.aborted) return;

        if (batch.length < BATCH_SIZE) break;
        const last = batch[batch.length - 1]!;
        cursor = { createdAt: last.createdAt, id: last.id };
      }
      await archive.finish(departed.signal);
    } catch (err: unknown) {
      console.error("Export failed:", err);
      if (!res.headersSent) {
        res
          .status(500)
          .type("text/plain")
          .send("Could not build the export.\n");
        return;
      }
      // Past the status line the only honest signal left is an incomplete
      // response. Ending the archive normally would hand over a zip whose
      // central directory claims it holds everything.
      archive?.abandon();
    }
  });

  return router;
}
