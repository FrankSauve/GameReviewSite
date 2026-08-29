import { once } from "node:events";
import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { readSession } from "../lib/session.js";
import {
  REVIEW_SEPARATOR,
  exportFilename,
  formatReview,
} from "../lib/exportMarkdown.js";

/**
 * Downloading your own reviews as one markdown file.
 *
 *   GET /export/reviews.md
 *
 * Deliberately not a GraphQL field. Every list in the schema is bounded, and the
 * text budget in lib/budget.ts would refuse a backlog of any size — those guards
 * exist because a small query returning megabytes is the failure mode this API
 * has already been bitten by. An export is that shape on purpose, so it gets its
 * own endpoint that streams rather than an exemption carved into the ones that
 * stop it.
 *
 * It is a GET carrying the session cookie, which means another site can cause a
 * browser to fetch it. That is acceptable here and nowhere else in this app: it
 * changes nothing, and the response is opaque cross-origin, so the page that
 * triggered it cannot read a word of what came back.
 */

/** Rows held in memory at once. Only one batch is resident: the loop waits for
 *  the socket to drain before reading the next. */
const BATCH_SIZE = 50;

/** The last row of a batch, as the position the next one resumes from. */
interface Cursor {
  createdAt: Date;
  id: string;
}

/**
 * Writes a chunk, waiting for the socket if it is full. Returns false once the
 * client has gone, which ends the export rather than reading a backlog nobody
 * is receiving.
 *
 * Ignoring the return value of `write` is what makes a "streaming" response
 * hold the whole file: the loop runs to completion at memory speed and every
 * batch it read piles up in the socket buffer.
 */
async function writeChunk(res: Response, chunk: string, gone: AbortSignal) {
  if (res.write(chunk)) return true;
  if (gone.aborted) return false;
  try {
    await once(res, "drain", { signal: gone });
    return true;
  } catch {
    return false;
  }
}

export function createExportRouter(): Router {
  const router = Router();

  router.get("/reviews.md", async (req: Request, res: Response) => {
    const session = await readSession(req);
    if (!session) {
      res.status(401).type("text/plain").send("Sign in to export your reviews.\n");
      return;
    }

    // The user's own slug, not their username: authentik owns the username and
    // renames it, the slug is this app's and does not move. It is also already
    // url-safe, so it cannot inject a newline into the header — whereas the
    // username reaches us from authentik unconstrained.
    const filename = exportFilename(session.user.slug);

    res.type("text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // Someone else's export must never be served from a shared cache, and one's
    // own is stale the moment a review is written.
    res.setHeader("Cache-Control", "no-store");

    const departed = new AbortController();
    res.on("close", () => departed.abort());

    try {
      let written = 0;
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
            content: true,
            game: { select: { title: true } },
          },
        });
        if (batch.length === 0) break;

        for (const review of batch) {
          const section = written > 0 ? REVIEW_SEPARATOR : "";
          const ok = await writeChunk(
            res,
            section +
              formatReview({
                gameTitle: review.game.title,
                rating: review.rating,
                hoursPlayed: review.hoursPlayed,
                yearPlayed: review.yearPlayed,
                content: review.content,
              }),
            departed.signal
          );
          if (!ok) return;
          written += 1;
        }

        if (batch.length < BATCH_SIZE) break;
        const last = batch[batch.length - 1]!;
        cursor = { createdAt: last.createdAt, id: last.id };
      }
      res.end();
    } catch (err: unknown) {
      console.error("Export failed:", err);
      if (!res.headersSent) {
        res.status(500).type("text/plain").send("Could not build the export.\n");
        return;
      }
      // Past the status line the only honest signal left is an incomplete
      // response. Ending the stream normally would hand over a truncated file
      // that looks complete.
      res.destroy();
    }
  });

  return router;
}
