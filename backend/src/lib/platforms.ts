import { badInput } from "./badInput.js";

/**
 * The platforms a review may be recorded on: one entry per hardware family,
 * not per model. Duplicated as PLATFORMS in frontend/src/lib/platforms.ts,
 * which draws the dropdown; this copy is authoritative and is the one that
 * refuses a write.
 */
export const PLATFORMS = [
  "PC",
  "PlayStation",
  "Xbox",
  "Switch",
  "Wii",
  "Nintendo DS",
  "GameCube",
  "iOS",
  "Android",
  "Web",
] as const;

const CANONICAL = new Map(PLATFORMS.map((name) => [name.toLowerCase(), name]));

/**
 * Matched case-insensitively and stored in the list's spelling: a stored
 * variant would not be selected by the dropdown that offers it.
 */
export function validatePlatform(value: string): string {
  const canonical = CANONICAL.get(value.trim().toLowerCase());
  if (!canonical)
    throw badInput("platform must be one of the platforms offered.");
  return canonical;
}
