/**
 * Scores are half-points on a 1–10 scale.
 *
 * The scale itself is shared with the backend, which is the side that enforces
 * it — `validateRating` in `backend/src/resolvers/review.ts` refuses anything
 * off-step. These constants exist so the input cannot offer a value the API will
 * reject, not as a substitute for that check.
 */
export const RATING_MIN = 1;
export const RATING_MAX = 10;
export const RATING_STEP = 0.5;

/** Every score the picker offers, low to high. */
export const RATING_VALUES: number[] = Array.from(
  { length: (RATING_MAX - RATING_MIN) / RATING_STEP + 1 },
  (_, i) => RATING_MIN + i * RATING_STEP
);

/**
 * `9.5` and `9`, never `9.0`.
 *
 * `toFixed(1)` was used at nine call sites and printed a trailing `.0` on every
 * whole score, which was harmless when whole scores were the only kind and reads
 * as noise now that half-points mean something.
 */
export function formatRating(rating: number): string {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

/**
 * The colour a score is shown in. Was copy-pasted into five files, three of them
 * as an inline ternary, which is why two of the copies had already drifted into
 * different Tailwind shades.
 */
export function ratingColor(rating: number): string {
  if (rating >= 8) return "text-emerald-400";
  if (rating >= 6) return "text-amber-400";
  return "text-red-400";
}

/** Snaps to the nearest half point and clamps to the scale. */
export function snapRating(rating: number): number {
  const clamped = Math.min(Math.max(rating, RATING_MIN), RATING_MAX);
  return Math.round(clamped / RATING_STEP) * RATING_STEP;
}
