import { Router, type Request, type Response } from "express";

import { prisma } from "../lib/prisma.js";
import { byIdOrSlug } from "../lib/slug.js";
import type { ImageKind, ImageOwner } from "../lib/shareImage.js";
import type { RenderedImage } from "../lib/shareImageRender.js";
import { AWARDS_IMAGE_SEGMENT, parseImageFile } from "../lib/awardsImage.js";
import { loadAwardsImage } from "../lib/awardsImageData.js";
import { renderAwardsImage } from "../lib/awardsImageRender.js";
import {
  FAVORITES_IMAGE_SEGMENT,
  parseFavoritesImageFile,
} from "../lib/favoritesImage.js";
import { loadFavoritesImage } from "../lib/favoritesImageData.js";
import { renderFavoritesImage } from "../lib/favoritesImageRender.js";
import { publicOrigin } from "../lib/origin.js";

/** What one image route has found to draw. */
interface FoundImage {
  version: string;
  kind: ImageKind;
  filename: string;
  render: () => Promise<RenderedImage>;
}

interface ImageRoute<Parsed> {
  /** Null for a file name the route never serves, before any query runs. */
  parse: (file: string) => Parsed | null;
  find: (
    owner: ImageOwner,
    file: Parsed,
    site: string,
  ) => Promise<FoundImage | null>;
  missingText: string;
}

/** `<prefix>/<slug>/<file>`, for every user agent. */
function serve<Parsed>({ parse, find, missingText }: ImageRoute<Parsed>) {
  return async (req: Request, res: Response) => {
    const key = typeof req.params["key"] === "string" ? req.params["key"] : "";
    const file =
      typeof req.params["file"] === "string" ? req.params["file"] : "";
    const missing = () => {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.status(404).type("text/plain").send(`${missingText}\n`);
    };

    const parsed = parse(file);
    if (parsed === null) return missing();

    try {
      const owner = await prisma.user.findFirst({
        where: byIdOrSlug(key),
        select: { id: true, username: true, slug: true, palette: true },
      });
      if (!owner) return missing();

      const image = await find(owner, parsed, new URL(publicOrigin(req)).host);
      if (!image) return missing();

      // Revalidated every time, so a download right after a save is current.
      res.setHeader("Cache-Control", "public, no-cache");
      res.setHeader("ETag", `"${image.version}-${image.kind}"`);
      // Meant to be embedded elsewhere. Set before the 304 too, whose headers
      // replace the cached response's.
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      if (req.fresh) {
        res.status(304).end();
        return;
      }

      const { png, complete } = await image.render();
      // A placeholder shares the ETag of the finished image, so it is never
      // kept: a 304 would pin it for good.
      if (!complete) {
        res.removeHeader("ETag");
        res.setHeader("Cache-Control", "no-store");
      }
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${image.filename}"`,
      );
      res.type("png").send(png);
    } catch (err: unknown) {
      console.error("Share image render failed:", err);
      res.removeHeader("ETag");
      res.setHeader("Cache-Control", "no-store");
      res.status(503).type("text/plain").send("Could not draw the image.\n");
    }
  };
}

const awards: ImageRoute<{ year: number; kind: ImageKind }> = {
  parse: parseImageFile,
  find: async (owner, { year, kind }, site) => {
    const image = await loadAwardsImage(owner, year, site);
    if (!image) return null;
    const { source, palette, version } = image;
    return {
      version,
      kind,
      filename: `${owner.slug}-${year}-awards.png`,
      render: () => renderAwardsImage(kind, source, palette, version),
    };
  },
  missingText: "No awards for that year.",
};

const favorites: ImageRoute<ImageKind> = {
  parse: parseFavoritesImageFile,
  find: async (owner, kind, site) => {
    const image = await loadFavoritesImage(owner, site);
    if (!image) return null;
    const { source, palette, version } = image;
    return {
      version,
      kind,
      filename: `${owner.slug}-favourites.png`,
      render: () => renderFavoritesImage(kind, source, palette, version),
    };
  },
  missingText: "No favourites picked.",
};

/** Mounted at SHARE_IMAGE_PREFIX, which only the backend serves. */
export function createShareImageRouter(): Router {
  const router = Router();
  router.get(`${AWARDS_IMAGE_SEGMENT}/:key/:file`, serve(awards));
  router.get(`${FAVORITES_IMAGE_SEGMENT}/:key/:file`, serve(favorites));
  return router;
}
