import { Router, type Request, type Response } from "express";

import { prisma } from "../lib/prisma.js";
import { byIdOrSlug } from "../lib/slug.js";
import {
  PROFILE_EMBED,
  REVIEW_EMBED,
  embedDescription,
  embedProfileDescription,
  embedProfileTitle,
  embedTitle,
  renderMissingEmbed,
  renderUnavailableEmbed,
  renderEmbed,
  type EmbedKind,
} from "../lib/embed.js";

/**
 * Link previews for reviews and profiles, on the same paths the SPA serves: the
 * URL people paste is the URL that has to unfurl. The proxy routes crawler user
 * agents here; see `location /reviews/` and `location /users/` in
 * deploy/swag/gamereviews.subdomain.conf.
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

/** A crawler gets the stub rather than Express's error page: the bare mount
 *  path, or a deeper one the SPA has no route for either. */
function notFound(kind: EmbedKind) {
  return (req: Request, res: Response) => {
    res.type("text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    const path = `${req.baseUrl}${req.path}`.replace(/\/+$/, "");
    res
      .status(404)
      .send(renderMissingEmbed(kind, `${publicOrigin(req)}${path}`));
  };
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
          user: { select: { username: true } },
          game: { select: { title: true, coverUrl: true } },
        },
      });

      if (!review) {
        res
          .status(404)
          .send(
            renderMissingEmbed(
              REVIEW_EMBED,
              `${origin}/reviews/${encodePath(key)}`,
            ),
          );
        return;
      }

      res.send(
        renderEmbed(REVIEW_EMBED, {
          title: embedTitle(
            review.game.title,
            review.rating,
            review.user.username,
          ),
          description: embedDescription(review.content),
          // The slug, not the key that was asked for: a UUID link unfurls with
          // the readable URL, the same way the SPA rewrites the address bar.
          url: `${origin}/reviews/${review.slug}`,
          imageUrl: review.game.coverUrl,
        }),
      );
    } catch (err: unknown) {
      console.error("Embed render failed:", err);
      // A cached 500 would outlive the fault.
      res.setHeader("Cache-Control", "no-store");
      res
        .status(503)
        .send(
          renderUnavailableEmbed(
            REVIEW_EMBED,
            `${origin}/reviews/${encodePath(key)}`,
          ),
        );
    }
  };

  router.get("/:user/:game", handler);
  router.get("/:key", handler);

  router.use(notFound(REVIEW_EMBED));

  return router;
}

/**
 * The same thing for `/users/<slug>`. Separate router because the paths below
 * it differ: a profile is one segment, optionally followed by the tab the SPA
 * renders (`/by-score`, `/recent`, `/by-year`), which unfurls as the profile.
 */
export function createProfileEmbedRouter(): Router {
  const router = Router();

  const handler = async (req: Request, res: Response) => {
    const raw = req.params["key"];
    const key = typeof raw === "string" ? raw : "";
    const origin = publicOrigin(req);

    res.type("text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");

    try {
      const user = await prisma.user.findFirst({
        where: byIdOrSlug(key),
        select: {
          slug: true,
          username: true,
          bio: true,
          _count: { select: { reviews: true } },
        },
      });

      if (!user) {
        res
          .status(404)
          .send(
            renderMissingEmbed(
              PROFILE_EMBED,
              `${origin}/users/${encodePath(key)}`,
            ),
          );
        return;
      }

      res.send(
        renderEmbed(PROFILE_EMBED, {
          title: embedProfileTitle(user.username, user._count.reviews),
          description: embedProfileDescription(user.username, user.bio),
          // The slug, not the key that was asked for, as above.
          url: `${origin}/users/${user.slug}`,
        }),
      );
    } catch (err: unknown) {
      console.error("Profile embed render failed:", err);
      res.setHeader("Cache-Control", "no-store");
      res
        .status(503)
        .send(
          renderUnavailableEmbed(
            PROFILE_EMBED,
            `${origin}/users/${encodePath(key)}`,
          ),
        );
    }
  };

  router.get("/:key", handler);
  router.get("/:key/:tab", handler);

  router.use(notFound(PROFILE_EMBED));

  return router;
}
