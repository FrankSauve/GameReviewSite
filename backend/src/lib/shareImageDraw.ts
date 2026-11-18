import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import { IMAGE_SIZES, type ImageKind, type ImageNode } from "./shareImage.js";

/** Satori reads static TTF/OTF/WOFF only; the site's own fonts are variable WOFF2. */
const FONT_WEIGHTS = [500, 600, 700, 800, 900] as const;
/**
 * Satori falls back only across differently named fonts, so each subset past
 * latin gets a name of its own, or a title outside latin draws as nothing.
 */
const FONT_SUBSETS = [
  "latin",
  "latin-ext",
  "cyrillic",
  "cyrillic-ext",
  "greek",
  "greek-ext",
  "vietnamese",
] as const;
let fonts: Parameters<typeof satori>[1]["fonts"] | undefined;
function loadFonts() {
  if (fonts) return fonts;
  const require = createRequire(import.meta.url);
  const dir = join(
    dirname(require.resolve("@fontsource/inter-tight/package.json")),
    "files",
  );
  fonts = FONT_SUBSETS.flatMap((subset) =>
    FONT_WEIGHTS.map((weight) => ({
      name: subset === "latin" ? "Inter Tight" : `Inter Tight ${subset}`,
      weight,
      style: "normal" as const,
      data: readFileSync(
        join(dir, `inter-tight-${subset}-${weight}-normal.woff`),
      ),
    })),
  );
  return fonts;
}

/** Holds its thread for the whole draw, so it runs only in shareImageWorker.ts. */
export async function drawImage(
  kind: ImageKind,
  tree: ImageNode,
): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height } = IMAGE_SIZES[kind];
  const svg = await satori(tree, {
    width,
    height,
    fonts: loadFonts(),
  });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } })
    .render()
    .asPng();
  // A copy that owns its whole buffer, so it can be transferred, not cloned.
  return new Uint8Array(png);
}
