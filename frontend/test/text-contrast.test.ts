import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The token layer in index.css is the only place these colours exist, so this
 * reads them back out rather than restating them. --text-faint is absent on
 * purpose: it is not a text rung. See the comment above the ramp.
 */
const TEXT_RUNGS = ["text", "text-body", "text-muted", "text-subtle"] as const;
const BACKGROUNDS = ["bg", "surface", "surface-raised"] as const;

/** WCAG 2.1 AA for body text. */
const AA = 4.5;

const css = readFileSync(
  fileURLToPath(new URL("../src/index.css", import.meta.url)),
  "utf8",
);

type Rgb = [number, number, number];

/**
 * Each palette restates the core tokens, so the last definition before the end
 * of a palette's block wins. Themes name no colours, so only palettes matter.
 */
function block(selector: string): string {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`no ${selector} block in index.css`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("\n  }", open);
  return css.slice(open, close);
}

function token(source: string, name: string): Rgb {
  const found = source.match(new RegExp(`--${name}:\\s*([\\d\\s]+);`));
  if (!found?.[1]) throw new Error(`no --${name} in block`);
  const parts = found[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 3) throw new Error(`--${name} is not a channel triplet`);
  return parts as unknown as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** midnight is :root; ember overrides accent only, so it inherits this ramp. */
const PALETTES = {
  midnight: block(":root {"),
  paper: block('[data-palette="paper"] {'),
};

describe("the text colour ramp", () => {
  for (const [palette, source] of Object.entries(PALETTES)) {
    for (const rung of TEXT_RUNGS) {
      for (const background of BACKGROUNDS) {
        it(`reads at AA: ${palette} --${rung} on --${background}`, () => {
          const ratio = contrast(
            token(source, rung),
            token(source, background),
          );
          expect(ratio).toBeGreaterThanOrEqual(AA);
        });
      }
    }
  }

  /**
   * Not a text rung, but it still has to be visible as a separator. Kept below
   * the text rungs so the hierarchy reads.
   */
  for (const [palette, source] of Object.entries(PALETTES)) {
    it(`keeps ${palette} --text-faint visible but under --text-subtle`, () => {
      const surface = token(source, "surface");
      const faint = contrast(token(source, "text-faint"), surface);
      const subtle = contrast(token(source, "text-subtle"), surface);
      expect(faint).toBeGreaterThanOrEqual(3);
      expect(faint).toBeLessThan(subtle);
    });
  }
});
