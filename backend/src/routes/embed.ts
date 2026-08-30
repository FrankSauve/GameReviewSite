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
 * Link previews for reviews, on the same path the SPA serves: the URL people
 * paste is the URL that has to unfurl. The proxy routes crawler user agents
 * here; see `location /reviews/` in deploy/swag/gamereviews.subdomain.conf.
 *
 * Anonymous by design — nothing here reads a session.
 */

/** Public origin for the canonical URL. Derived from the forwarded headers SWAG
 *  sets; PUBLIC_ORIGIN pins it where they are absent or not trusted. */
function publicOrigin(req: Request): string {
  const configured = process.env["PUBLIC_ORIGIN"];
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

function encodePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function createEmbedRouter(): Router {
  const router = Router();

  const handler = async (req: Request, res: Response) => {
    const one = (name: string) => {
      const raw = req.params[name];
      return typeof raw === "string" ? raw : "";
    };
    const game = one("game");
    const key = game ? `${one("user")}/${game}` : one("key");
    const origin = publicOrigin(req);

    res.type("text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");

    try {
      const review = await prisma.review.findFirst({
        where: byIdOrSlug(key),
        select: {
          slug: true,
          rating: true,
          content: true,
          game: { select: { title: true, coverUrl: true } },
        },
      });

      if (!review) {
        res.status(404).send(renderMissingEmbed(`${origin}/reviews/${encodePath(key)}`));
        return;
      }

      res.send(
        renderReviewEmbed({
          title: embedTitle(review.game.title, review.rating),
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
      res.status(503).send(renderUnavailableEmbed(`${origin}/reviews/${encodePath(key)}`));
    }
  };

  router.get("/:user/:game", handler);
  router.get("/:key", handler);

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
