import { badInput } from "./badInput.js";

/**
 * The platforms a review may be recorded on.
 *
 * Spelled exactly as RAWG spells them, because the 20260831 migration backfills
 * this column from the RAWG-sourced `Game.platforms` and anything off this list
 * becomes null. Duplicated as PLATFORMS in frontend/src/lib/platforms.ts, which
 * draws the dropdown; this copy is authoritative and is the one that refuses a
 * write.
 */
export const PLATFORMS = [
  "PC",
  "macOS",
  "Linux",
  "PlayStation 5",
  "PlayStation 4",
  "PlayStation 3",
  "PlayStation 2",
  "PlayStation",
  "PS Vita",
  "PSP",
  "Xbox Series S/X",
  "Xbox One",
  "Xbox 360",
  "Xbox",
  "Nintendo Switch",
  "Wii U",
  "Wii",
  "Nintendo 3DS",
  "Nintendo DS",
  "GameCube",
  "Nintendo 64",
  "SNES",
  "NES",
  "Game Boy Advance",
  "iOS",
  "Android",
  "Web",
] as const;

const CANONICAL = new Map(PLATFORMS.map((name) => [name.toLowerCase(), name]));

/**
 * Matched case-insensitively and stored in the list's spelling: RAWG is
 * inconsistent about "macOS" and "MacOS", and a stored variant would not be
 * selected by the dropdown that offers it.
 */
export function validatePlatform(value: string): string {
  const canonical = CANONICAL.get(value.trim().toLowerCase());
  if (!canonical)
    throw badInput("platform must be one of the platforms offered.");
  return canonical;
}
