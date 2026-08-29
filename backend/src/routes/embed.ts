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
 * Link previews for reviews.
 *
 *   GET /reviews/:slug
 *
 * The same path the SPA serves, and that is the point: the URL people paste into
 * a chat window has to be the URL that unfurls. A crawler cannot run the SPA's
 * JavaScript, so the reverse proxy sends requests with a known bot user agent
 * here instead of to the frontend container, and everyone else goes on getting
 * the React app untouched. See the `location /reviews/` block in
 * deploy/swag/gamereviews.subdomain.conf.
 *
 * Consequences of that split worth keeping in mind:
 *
 *   - This must answer for *any* review URL, including the UUID form that still
 *     resolves, so the lookup goes through `byIdOrSlug` like every other one.
 *   - It is anonymous by design. Reviews are readable without signing in, and a
 *     crawler carries no cookie; nothing here reads a session, so nothing here
 *     can leak one person's view of the site to another.
 *   - A person who lands on it — a misdetected user agent, or curl — gets a
 *     small page with the same facts and a link, not a blank document.
 */

/** Public origin for the canonical URL in the tags. Behind SWAG the forwarded
 *  headers are set by proxy.conf; PUBLIC_ORIGIN overrides them for a deployment
 *  where they are not, and pins the value if the Host header is not trusted. */
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

    // Neither branch below varies by cookie, so this is safe to cache publicly —
    // and worth it: a link pasted into a busy channel is fetched once per client
    // that saw it.
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
      // A crawler has no use for an error page, and a cached 500 would outlive
      // the fault. Say nothing, cache nothing.
      res.setHeader("Cache-Control", "no-store");
      res.status(503).send(renderUnavailableEmbed(`${origin}/reviews/${encodeURIComponent(key)}`));
    }
  });

  return router;
}
