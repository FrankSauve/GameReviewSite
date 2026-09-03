/**
 * The platforms the review form offers.
 *
 * A copy of PLATFORMS in backend/src/lib/platforms.ts, which is authoritative
 * and refuses anything off it — there is no package shared between the two.
 * Change that copy too, or the form offers a value the server rejects.
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
];

/**
 * What a new review starts on. Editing an existing one keeps what it stored,
 * so saving an unrelated edit never invents a platform it never had.
 */
export const DEFAULT_PLATFORM = "PC";
