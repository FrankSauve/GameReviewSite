import { Router, type Request, type Response } from "express";

import { prisma } from "../lib/prisma.js";
import { byIdOrSlug } from "../lib/slug.js";
import {
  embedDescription,
  embedTitle,
  renderMissingEmbed,
  renderUnavailableEmbed,
  renderReviewEmbed,
} from "../lib/embed.js";

/**
 * Link previews for reviews: `GET /reviews/:slug`.
 *
 * The same path the SPA serves, because the URL people paste is the URL that has
 * to unfurl. The proxy routes crawler user agents here; see the
 * `location /reviews/` block in deploy/swag/gamereviews.subdomain.conf.
 *
 * Anonymous by design — nothing here reads a session, so nothing here can leak
 * one person's view of the site to another.
 */

/** Public origin for the canonical URL. Derived from the forwarded headers SWAG
 *  sets; PUBLIC_ORIGIN pins it where they are absent or not trusted. */
function publicOrigin(req: Request): string {
  const configured = process.env["PUBLIC_ORIGIN"];
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

export function createEmbedRouter(): Router {
  const router = Router();

  router.get("/:key", async (req: Request, res: Response) => {
    // Express 5 types a route parameter as possibly repeated; this one cannot
    // be, but the narrowing has to be written down.
    const raw = req.params["key"];
    const key = typeof raw === "string" ? raw : "";
    const origin = publicOrigin(req);

    // Nothing here varies by cookie, and a link pasted into a busy channel is
    // fetched once per client that saw it.
    res.type("text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");

    try {
      const review = await prisma.review.findFirst({
        where: byIdOrSlug(key),
        select: {
          slug: true,
          rating: true,
          content: true,
          user: { select: { username: true } },
          game: { select: { title: true, coverUrl: true } },
        },
      });

      if (!review) {
        res.status(404).send(renderMissingEmbed(`${origin}/reviews/${encodeURIComponent(key)}`));
        return;
      }

      res.send(
        renderReviewEmbed({
          title: embedTitle(review.game.title, review.rating, review.user.username),
          description: embedDescription(review.content),
          // The slug, not the key that was asked for: a UUID link unfurls with
          // the readable URL, the same way the SPA rewrites the address bar.
          url: `${origin}/reviews/${review.slug}`,
          imageUrl: review.game.coverUrl,
        })
      );
    } catch (err: unknown) {
      console.error("Embed render failed:", err);
      // A cached 500 would outlive the fault.
      res.setHeader("Cache-Control", "no-store");
      res.status(503).send(renderUnavailableEmbed(`${origin}/reviews/${encodeURIComponent(key)}`));
    }
  });

  // Anything else under /reviews — the bare path, or a deeper one the SPA has no
  // route for either. A crawler gets the stub rather than Express's error page.
  router.use((req: Request, res: Response) => {
    res.type("text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    const path = `${req.baseUrl}${req.path}`.replace(/\/+$/, "");
    res.status(404).send(renderMissingEmbed(`${publicOrigin(req)}${path}`));
  });

  return router;
}
