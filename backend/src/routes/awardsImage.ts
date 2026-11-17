import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";

import { prisma } from "../lib/prisma.js";
import { byIdOrSlug } from "../lib/slug.js";
import { parseImageFile } from "../lib/awardsImage.js";
import { loadAwardsImageSource } from "../lib/awardsImageData.js";
import { imagePalette } from "../lib/awardsImagePalettes.js";
import {
  awardsImageVersion,
  renderAwardsImage,
} from "../lib/awardsImageRender.js";
import { publicOrigin } from "../lib/origin.js";

/**
 * `/users/<slug>/awards/<year>.png` and `<year>-wide.png`: a year's awards as
 * an image, for the download button and for the awards tab's `og:image`. Every
 * user agent comes here, not only crawlers; see the `.png` location in
 * deploy/swag/gamereviews.subdomain.conf. Anonymous, like the embeds.
 */
export function createAwardsImageRouter(): Router {
  const router = Router();

  router.get(
    "/:key/awards/:file",
    async (req: Request, res: Response, next: NextFunction) => {
      const key =
        typeof req.params["key"] === "string" ? req.params["key"] : "";
      const file =
        typeof req.params["file"] === "string" ? req.params["file"] : "";
      const parsed = parseImageFile(file);
      if (!parsed) {
        next();
        return;
      }

      const missing = () => {
        res.setHeader("Cache-Control", "public, max-age=60");
        res.status(404).type("text/plain").send("No awards for that year.\n");
      };

      try {
        const user = await prisma.user.findFirst({
          where: byIdOrSlug(key),
          select: { id: true, username: true, slug: true, palette: true },
        });
        if (!user) return missing();

        const source = await loadAwardsImageSource(
          user,
          parsed.year,
          new URL(publicOrigin(req)).host,
        );
        if (!source) return missing();

        const version = awardsImageVersion(source, user.palette);
        // Revalidated every time, so a download right after a save is current;
        // a match costs two reads and no render.
        res.setHeader("Cache-Control", "public, no-cache");
        res.setHeader("ETag", `"${version}-${parsed.kind}"`);
        if (req.fresh) {
          res.status(304).end();
          return;
        }

        const png = await renderAwardsImage(
          parsed.kind,
          source,
          imagePalette(user.palette),
          version,
        );
        // Meant to be posted elsewhere, so other sites may embed it.
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${user.slug}-${parsed.year}-awards.png"`,
        );
        res.type("png").send(png);
      } catch (err: unknown) {
        console.error("Awards image render failed:", err);
        res.setHeader("Cache-Control", "no-store");
        res.status(503).type("text/plain").send("Could not draw the image.\n");
      }
    },
  );

  return router;
}
