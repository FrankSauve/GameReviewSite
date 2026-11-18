import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  IMAGE_PALETTES,
  IMAGE_TOKENS,
  imagePalette,
} from "../src/lib/shareImagePalettes.js";
import { PALETTES } from "../src/lib/theme.js";

/** Read as text: the frontend is outside this compilation. */
const css = readFileSync(
  new URL("../../frontend/src/index.css", import.meta.url),
  "utf8",
);

function block(palette: string): string {
  const start = css.indexOf(`[data-palette="${palette}"]`);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  return css.slice(open, css.indexOf("}", open));
}

describe("the shared images' palettes", () => {
  it.each(PALETTES)("paint %s with the site's own colours", (palette) => {
    const body = block(palette);
    expect(body).not.toBe("");
    for (const token of IMAGE_TOKENS) {
      const value = new RegExp(`--${token}:\\s*([^;]+);`).exec(body)?.[1];
      expect(IMAGE_PALETTES[palette][token], `--${token}`).toBe(value);
    }
  });

  it("fall back to midnight for no choice or a retired one", () => {
    expect(imagePalette(null)).toBe(IMAGE_PALETTES.midnight);
    expect(imagePalette("sepia")).toBe(IMAGE_PALETTES.midnight);
    expect(imagePalette("ember")).toBe(IMAGE_PALETTES.ember);
  });
});
