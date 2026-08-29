import { Router, type Request, type Response } from "express";

import { prisma } from "../lib/prisma.js";
import { readSession } from "../lib/session.js";
import { slugify } from "../lib/slug.js";
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

/** Rows held in memory at once. The bodies are the large part; 50 maximal ones
 *  is about a megabyte, and each batch is written out before the next is read. */
const BATCH_SIZE = 50;

export function createExportRouter(): Router {
  const router = Router();

  router.get("/reviews.md", async (req: Request, res: Response) => {
    const session = await readSession(req);
    if (!session) {
      res.status(401).type("text/plain").send("Sign in to export your reviews.\n");
      return;
    }

    // The username reaches this app from authentik and ends up in a response
    // header, so it is slugified rather than interpolated: a quote or a newline
    // in it would otherwise be header injection.
    const filename = exportFilename(slugify(session.user.username, "reviews"));

    res.type("text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // Someone else's export must never be served from a shared cache, and one's
    // own is stale the moment a review is written.
    res.setHeader("Cache-Control", "no-store");

    try {
      let written = 0;
      for (let skip = 0; ; skip += BATCH_SIZE) {
        const batch = await prisma.review.findMany({
          where: { userId: session.user.id },
          // Newest first, as the site reads. The id breaks ties because a
          // backlog imported in one go shares a `createdAt` to the millisecond,
          // and batches of an unstable order would drop and repeat reviews.
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: BATCH_SIZE,
          skip,
          select: {
            rating: true,
            hoursPlayed: true,
            content: true,
            game: { select: { title: true } },
          },
        });
        if (batch.length === 0) break;

        for (const review of batch) {
          if (written > 0) res.write(REVIEW_SEPARATOR);
          res.write(
            formatReview({
              gameTitle: review.game.title,
              rating: review.rating,
              hoursPlayed: review.hoursPlayed,
              content: review.content,
            })
          );
          written += 1;
        }

        if (batch.length < BATCH_SIZE) break;
      }
      res.end();
    } catch (err: unknown) {
      console.error("Export failed:", err);
      // The status line is long gone by the time a later batch can fail, so the
      // only honest signal left is an incomplete response. Ending the stream
      // normally would hand over a truncated file that looks complete.
      res.destroy();
    }
  });

  return router;
}
