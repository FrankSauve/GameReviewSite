import { Router, type Request, type Response } from "express";

import { prisma } from "../lib/prisma.js";
import { byIdOrSlug } from "../lib/slug.js";
import { parseImageFile } from "../lib/awardsImage.js";
import { loadAwardsImage } from "../lib/awardsImageData.js";
import { renderAwardsImage } from "../lib/awardsImageRender.js";
import { publicOrigin } from "../lib/origin.js";

/** `/images/awards/<slug>/<year>.png` and `<year>-wide.png`, for every user agent. */
export function createAwardsImageRouter(): Router {
  const router = Router();

  router.get("/:key/:file", async (req: Request, res: Response) => {
    const key = typeof req.params["key"] === "string" ? req.params["key"] : "";
    const file =
      typeof req.params["file"] === "string" ? req.params["file"] : "";
    const missing = () => {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.status(404).type("text/plain").send("No awards for that year.\n");
    };

    const parsed = parseImageFile(file);
    if (!parsed) return missing();

    try {
      const user = await prisma.user.findFirst({
        where: byIdOrSlug(key),
        select: { id: true, username: true, slug: true, palette: true },
      });
      if (!user) return missing();

      const image = await loadAwardsImage(
        user,
        parsed.year,
        new URL(publicOrigin(req)).host,
      );
      if (!image) return missing();
      const { source, palette, version } = image;

      // Revalidated every time, so a download right after a save is current.
      res.setHeader("Cache-Control", "public, no-cache");
      res.setHeader("ETag", `"${version}-${parsed.kind}"`);
      // Meant to be embedded elsewhere. Set before the 304 too, whose headers
      // replace the cached response's.
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      if (req.fresh) {
        res.status(304).end();
        return;
      }

      const { png, complete } = await renderAwardsImage(
        parsed.kind,
        source,
        palette,
        version,
      );
      // A placeholder shares the ETag of the finished image, so it is never
      // kept: a 304 would pin it for good.
      if (!complete) {
        res.removeHeader("ETag");
        res.setHeader("Cache-Control", "no-store");
      }
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${user.slug}-${parsed.year}-awards.png"`,
      );
      res.type("png").send(png);
    } catch (err: unknown) {
      console.error("Awards image render failed:", err);
      res.removeHeader("ETag");
      res.setHeader("Cache-Control", "no-store");
      res.status(503).type("text/plain").send("Could not draw the image.\n");
    }
  });

  return router;
}
