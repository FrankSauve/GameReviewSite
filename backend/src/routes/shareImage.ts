import { Router, type Request, type Response } from "express";

import { prisma } from "../lib/prisma.js";
import { byIdOrSlug } from "../lib/slug.js";
import type { ImageKind } from "../lib/shareImage.js";
import type { RenderedImage } from "../lib/shareImageRender.js";
import { parseImageFile } from "../lib/awardsImage.js";
import { loadAwardsImage } from "../lib/awardsImageData.js";
import { renderAwardsImage } from "../lib/awardsImageRender.js";
import { parseFavoritesImageFile } from "../lib/favoritesImage.js";
import { loadFavoritesImage } from "../lib/favoritesImageData.js";
import { renderFavoritesImage } from "../lib/favoritesImageRender.js";
import { publicOrigin } from "../lib/origin.js";

interface Owner {
  id: string;
  username: string;
  slug: string;
  palette: string | null;
}

/** What one image route has found to draw. */
interface FoundImage {
  version: string;
  kind: ImageKind;
  filename: string;
  render: () => Promise<RenderedImage>;
}

type Find = (
  owner: Owner,
  file: string,
  site: string,
) => Promise<FoundImage | null>;

/** `<prefix>/<slug>/<file>`, for every user agent. */
function serve(find: Find, missingText: string) {
  return async (req: Request, res: Response) => {
    const key = typeof req.params["key"] === "string" ? req.params["key"] : "";
    const file =
      typeof req.params["file"] === "string" ? req.params["file"] : "";
    const missing = () => {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.status(404).type("text/plain").send(`${missingText}\n`);
    };

    try {
      const owner = await prisma.user.findFirst({
        where: byIdOrSlug(key),
        select: { id: true, username: true, slug: true, palette: true },
      });
      if (!owner) return missing();

      const image = await find(owner, file, new URL(publicOrigin(req)).host);
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

const findAwards: Find = async (owner, file, site) => {
  const parsed = parseImageFile(file);
  if (!parsed) return null;
  const image = await loadAwardsImage(owner, parsed.year, site);
  if (!image) return null;
  const { source, palette, version } = image;
  return {
    version,
    kind: parsed.kind,
    filename: `${owner.slug}-${parsed.year}-awards.png`,
    render: () => renderAwardsImage(parsed.kind, source, palette, version),
  };
};

const findFavorites: Find = async (owner, file, site) => {
  const kind = parseFavoritesImageFile(file);
  if (!kind) return null;
  const image = await loadFavoritesImage(owner, site);
  if (!image) return null;
  const { source, palette, version } = image;
  return {
    version,
    kind,
    filename: `${owner.slug}-favourites.png`,
    render: () => renderFavoritesImage(kind, source, palette, version),
  };
};

/** Mounted at SHARE_IMAGE_PREFIX, which only the backend serves. */
export function createShareImageRouter(): Router {
  const router = Router();
  router.get(
    "/awards/:key/:file",
    serve(findAwards, "No awards for that year."),
  );
  router.get(
    "/favorites/:key/:file",
    serve(findFavorites, "No favourites picked."),
  );
  return router;
}
