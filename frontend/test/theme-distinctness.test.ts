import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PALETTES, THEMES } from "../src/lib/theme";

/**
 * Pins the rule the token layer's header comment states: a [data-theme] block
 * sets no colour token, and a [data-palette] block sets no shape, type or
 * motion one. That separation is the only reason 4 themes x 6 palettes is 10
 * things to maintain rather than 24.
 *
 * It also pins that the themes differ below the display face. They once did
 * not — all four rendered the same body font at the same size with the same
 * padding, which made the picker feel like it changed nothing.
 */
const css = readFileSync(
  fileURLToPath(new URL("../src/index.css", import.meta.url)),
  "utf8",
);

/**
 * A token naming a colour, whatever form it is held in. Spelled out rather
 * than matched loosely: `texture-image` and `line-height-body` both start with
 * the name of a colour token and are neither.
 */
const COLOUR_TOKENS = new Set([
  "bg",
  "surface",
  "surface-raised",
  "line",
  "line-strong",
  "ring",
  "scrim",
]);
const COLOUR_FAMILIES = [
  "text-",
  "accent-",
  "danger-",
  "warning-",
  "rating-",
  "avatar-",
  "cover-",
  "hue-",
];

function isColour(name: string): boolean {
  if (name === "text" || name === "accent" || name === "danger") return true;
  if (COLOUR_TOKENS.has(name)) return true;
  return COLOUR_FAMILIES.some((family) => name.startsWith(family));
}

function block(selector: string): string {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`no ${selector} block in index.css`);
  const open = css.indexOf("{", at);
  return css.slice(open, css.indexOf("\n  }", open));
}

/** The custom properties a block sets, ignoring the ones it merely reads. */
function declared(source: string): string[] {
  return [...source.matchAll(/^\s{4}--([a-z0-9-]+):/gm)].map((m) => m[1] ?? "");
}

const themeBlocks = THEMES.filter((t) => t.key !== "hud").map((t) => ({
  ...t,
  source: block(`[data-theme="${t.key}"] {`),
}));
const paletteBlocks = PALETTES.map((p) => ({
  ...p,
  // Midnight's selector doubles as :root, so the brace is left off the search.
  source: block(`[data-palette="${p.key}"]`),
}));

describe("the theme and palette axes stay independent", () => {
  for (const theme of themeBlocks) {
    it(`${theme.key} names no colour token`, () => {
      expect(declared(theme.source).filter(isColour)).toEqual([]);
    });
  }

  for (const palette of paletteBlocks) {
    it(`${palette.key} names only colour tokens`, () => {
      expect(declared(palette.source).filter((n) => !isColour(n))).toEqual([]);
    });
  }
});

describe("the themes differ below the display face", () => {
  const root = block(":root {");
  const value = (source: string, token: string): string =>
    source.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1]?.trim() ??
    root.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1]?.trim() ??
    "";

  // hud is :root, so it is read from there rather than from a block.
  const sources = [root, ...themeBlocks.map((t) => t.source)];

  for (const token of ["font-body", "root-size", "line-height-body"] as const) {
    it(`every theme does not share one --${token}`, () => {
      const values = sources.map((s) => value(s, token));
      expect(new Set(values).size).toBeGreaterThan(2);
    });
  }

  it("every theme decides its own texture rather than inheriting one", () => {
    // :root's texture is the HUD's, and body::before draws whatever it
    // inherits, so a theme that says nothing ships the HUD's scanlines.
    for (const theme of themeBlocks) {
      expect(declared(theme.source)).toContain("texture-image");
    }
  });

  it("at least one theme lifts a card on hover", () => {
    const lifts = sources
      .map((s) => value(s, "card-hover-lift"))
      .filter((v) => v !== "none" && v !== "");
    expect(lifts.length).toBeGreaterThan(0);
  });
});
