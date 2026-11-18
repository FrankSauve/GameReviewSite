import { Router, type Request, type Response } from "express";

import { prisma } from "../lib/prisma.js";
import { byIdOrSlug } from "../lib/slug.js";
import {
  AWARDS_TAB,
  FAVORITES_TAB,
  wantsPreviewImage,
  PROFILE_EMBED,
  REVIEW_EMBED,
  embedAwardsDescription,
  embedAwardsTitle,
  embedDescription,
  embedFavoritesDescription,
  embedFavoritesTitle,
  embedProfileDescription,
  embedProfileTitle,
  embedTitle,
  renderMissingEmbed,
  renderUnavailableEmbed,
  renderEmbed,
  type EmbedKind,
} from "../lib/embed.js";
import { awardYearsOf, parseAwardYear } from "../lib/awards.js";
import { awardsImagePath } from "../lib/awardsImage.js";
import { loadAwardsImage } from "../lib/awardsImageData.js";
import { renderAwardsImage } from "../lib/awardsImageRender.js";
import { favoritesImagePath } from "../lib/favoritesImage.js";
import { loadFavoritesImage } from "../lib/favoritesImageData.js";
import { renderFavoritesImage } from "../lib/favoritesImageRender.js";
import { publicOrigin } from "../lib/origin.js";

/**
 * Link previews for reviews and profiles, on the same paths the SPA serves: the
 * URL people paste is the URL that has to unfurl. The proxy routes crawler user
 * agents here; see `location /reviews/` and `location /users/` in
 * deploy/swag/gamereviews.subdomain.conf.
 *
 * Anonymous by design — nothing here reads a session.
 */

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

/** A chat client asks for the og:image next; started now, that request joins
 *  this render instead of beginning its own. */
function warmPreview(req: Request, render: () => Promise<unknown>): void {
  if (!wantsPreviewImage(req.get("user-agent"))) return;
  render().catch((err: unknown) => {
    console.error("Preview render failed:", err);
  });
}

/**
 * The same thing for `/users/<slug>`. Separate router because the paths below
 * it differ: a profile is one segment, optionally followed by the tab the SPA
 * renders. `/by-score`, `/by-genre`, `/recent` and `/by-year` unfurl as the
 * profile, being the same reviews in another order; `/favorites` unfurls as
 * the picks' image, and `/awards[/<year>]` as that year's image.
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
          id: true,
          slug: true,
          username: true,
          bio: true,
          palette: true,
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

      if (req.params["tab"] === FAVORITES_TAB) {
        // Its own query, so the other tabs do not pay for rows they never render.
        const image = await loadFavoritesImage(user, new URL(origin).host);

        // An empty grid falls through: nothing should unfurl to advertise that
        // there is nothing there.
        if (image) {
          const { source, palette, version } = image;
          res.send(
            renderEmbed(PROFILE_EMBED, {
              title: embedFavoritesTitle(user.username, source.picks.length),
              description: embedFavoritesDescription(source.picks),
              url: `${origin}/users/${user.slug}/${FAVORITES_TAB}`,
              // Versioned, because chat clients cache an image by its URL.
              imageUrl: `${origin}${favoritesImagePath(user.slug, "wide")}?v=${version}`,
            }),
          );
          warmPreview(req, () =>
            renderFavoritesImage("wide", source, palette, version),
          );
          return;
        }
      }

      if (req.params["tab"] === AWARDS_TAB) {
        // The year the SPA would open on: the URL's, or the newest with awards.
        const year =
          parseAwardYear(req.params["year"]) ??
          (await awardYearsOf([user.id]))[0]?.[0];
        const image =
          year === undefined
            ? null
            : await loadAwardsImage(user, year, new URL(origin).host);

        // An empty year falls through to the profile, as an empty grid does.
        if (image) {
          const { source, palette, version } = image;
          res.send(
            renderEmbed(PROFILE_EMBED, {
              title: embedAwardsTitle(user.username, source.year),
              description: embedAwardsDescription(
                source.ranking,
                source.categories,
              ),
              url: `${origin}/users/${user.slug}/${AWARDS_TAB}/${source.year}`,
              // Versioned, because chat clients cache an image by its URL.
              imageUrl: `${origin}${awardsImagePath(user.slug, source.year, "wide")}?v=${version}`,
            }),
          );
          warmPreview(req, () =>
            renderAwardsImage("wide", source, palette, version),
          );
          return;
        }
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
  router.get("/:key/:tab/:year", (req, res, next) => {
    // Only the awards tab has a third segment in the SPA.
    if (req.params.tab === AWARDS_TAB) return handler(req, res);
    next();
  });

  router.use(notFound(PROFILE_EMBED));

  return router;
}
