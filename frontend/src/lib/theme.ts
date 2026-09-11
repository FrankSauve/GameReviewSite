/**
 * The looks on offer, paired with the label the picker shows.
 *
 * The keys are duplicated as THEMES and PALETTES in backend/src/lib/theme.ts,
 * which is authoritative and refuses a write outside them; they must also match
 * the [data-theme] and [data-palette] blocks in src/index.css.
 */
export const THEMES = [
  { key: "hud", label: "Console" },
  { key: "swiss", label: "Quiet" },
  { key: "editorial", label: "Editorial" },
  { key: "brutalist", label: "Terminal" },
] as const;

export const PALETTES = [
  { key: "midnight", label: "Midnight" },
  { key: "ember", label: "Ember" },
  { key: "paper", label: "Paper" },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];
export type PaletteKey = (typeof PALETTES)[number]["key"];

/** The :root block is this pair, so an unstamped page already renders it. */
export const DEFAULT_THEME: ThemeKey = "hud";
export const DEFAULT_PALETTE: PaletteKey = "midnight";

export const THEME_STORAGE_KEY = "gr-theme";
export const PALETTE_STORAGE_KEY = "gr-palette";

const THEME_KEYS = new Set<string>(THEMES.map((t) => t.key));
const PALETTE_KEYS = new Set<string>(PALETTES.map((p) => p.key));

export function isTheme(value: unknown): value is ThemeKey {
  return typeof value === "string" && THEME_KEYS.has(value);
}

export function isPalette(value: unknown): value is PaletteKey {
  return typeof value === "string" && PALETTE_KEYS.has(value);
}

export interface Appearance {
  theme: ThemeKey;
  palette: PaletteKey;
}

/**
 * What the page should render, given the signed-in account's stored choice and
 * whatever this browser remembers.
 *
 * The account wins, so the choice follows someone between devices; the browser
 * is what a signed-out visitor gets. A value that is no longer offered falls
 * back rather than stamping an attribute no block matches.
 */
export function resolveAppearance(
  fromAccount: { theme?: string | null; palette?: string | null } | null,
  fromBrowser: { theme?: string | null; palette?: string | null },
): Appearance {
  const theme = [fromAccount?.theme, fromBrowser.theme].find(isTheme);
  const palette = [fromAccount?.palette, fromBrowser.palette].find(isPalette);
  return {
    theme: theme ?? DEFAULT_THEME,
    palette: palette ?? DEFAULT_PALETTE,
  };
}

/** Reading storage throws outright in some privacy modes, not just return null. */
export function readStoredAppearance(): {
  theme: string | null;
  palette: string | null;
} {
  try {
    return {
      theme: localStorage.getItem(THEME_STORAGE_KEY),
      palette: localStorage.getItem(PALETTE_STORAGE_KEY),
    };
  } catch {
    return { theme: null, palette: null };
  }
}

export function storeAppearance(appearance: Partial<Appearance>): void {
  try {
    if (appearance.theme) {
      localStorage.setItem(THEME_STORAGE_KEY, appearance.theme);
    }
    if (appearance.palette) {
      localStorage.setItem(PALETTE_STORAGE_KEY, appearance.palette);
    }
  } catch {
    // A browser that refuses storage still themes for this page view.
  }
}

/**
 * Stamps the pair onto <html>. The same two attributes the inline script in
 * index.html writes before first paint, so this only ever re-states them.
 */
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", appearance.theme);
  root.setAttribute("data-palette", appearance.palette);

  // The browser chrome colour cannot read a CSS variable, so it is the one
  // piece of the palette that has to be pushed across by hand.
  const meta = document.querySelector('meta[name="theme-color"]');
  const accent = getComputedStyle(root).getPropertyValue("--accent").trim();
  if (meta && accent) meta.setAttribute("content", `rgb(${accent})`);
}
