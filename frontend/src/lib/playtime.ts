/**
 * When a game was played, and for how long.
 *
 * Both bounds mirror `backend/src/resolvers/review.ts`, which is the side that
 * enforces them. These stop the form offering a value the API would refuse.
 */
export const YEAR_PLAYED_MIN = 1970;
export const HOURS_PLAYED_MAX = 10000;

/** Next year is allowed: finishing a game in December and writing it up in January. */
export function yearPlayedMax(now: Date = new Date()): number {
  return now.getFullYear() + 1;
}

export function currentYear(now: Date = new Date()): number {
  return now.getFullYear();
}

/** Years to offer in the picker, newest first. */
export function yearOptions(now: Date = new Date()): number[] {
  const max = yearPlayedMax(now);
  return Array.from({ length: max - YEAR_PLAYED_MIN + 1 }, (_, i) => max - i);
}

/**
 * `42h`, `47.5h`, never `42.0h` — the same reasoning as `formatRating`, and the
 * reason both live next to the value they format rather than at the call sites.
 */
export function formatHours(hours: number): string {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

/**
 * How a review's playtime reads on a card: `2019 · 42h`.
 *
 * Either half can be missing — the review that predates these columns has no hours,
 * and an imported one may have neither — so this returns null rather than a string
 * with a stray separator in it.
 */
export function formatPlaytime(
  yearPlayed?: number | null,
  hoursPlayed?: number | null
): string | null {
  const parts: string[] = [];
  if (yearPlayed != null) parts.push(String(yearPlayed));
  if (hoursPlayed != null) parts.push(formatHours(hoursPlayed));
  return parts.length ? parts.join(" · ") : null;
}

/** Rounds to one decimal, matching what the API stores. */
export function snapHours(hours: number): number {
  return Math.round(hours * 10) / 10;
}
