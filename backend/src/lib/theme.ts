import { validateChoice } from "./validate.js";

/**
 * The looks an account may pick. A theme owns shape, type, motion and density;
 * a palette owns colour. They are independent, so any pair is valid.
 *
 * Both lists are duplicated in frontend/src/lib/theme.ts, which pairs each key
 * with its label for the picker; this copy is authoritative and is the one that
 * refuses a write. The keys must match the [data-theme] and [data-palette]
 * blocks in frontend/src/index.css.
 */
export const THEMES = ["hud", "swiss", "editorial", "brutalist"] as const;

export const PALETTES = ["midnight", "ember", "paper"] as const;

const KNOWN_THEMES = new Set<string>(THEMES);
const KNOWN_PALETTES = new Set<string>(PALETTES);

/** Null clears the choice, which puts the account back on the default. */
export function validateTheme(value: string | null): string | null {
  return validateChoice(value, KNOWN_THEMES, "theme", "themes");
}

/** Null clears the choice, which puts the account back on the default. */
export function validatePalette(value: string | null): string | null {
  return validateChoice(value, KNOWN_PALETTES, "palette", "palettes");
}
