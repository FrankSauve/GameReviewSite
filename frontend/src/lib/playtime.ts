/**
 * Both bounds mirror backend/src/resolvers/review.ts, the side that enforces
 * them; these only stop the form offering a value the API would refuse.
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

const HOURS_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

/**
 * `42h`, `47.5h`, `10,000h`, never `42.0h`. The locale is pinned so the
 * separator is a comma whatever the browser's language.
 */
export function formatHours(hours: number): string {
  return `${HOURS_FORMAT.format(hours)}h`;
}

/**
 * How a review's playtime reads on a card: `2019 · 42h`. Either half can be
 * missing, so this returns null rather than a stray separator.
 */
export function formatPlaytime(
  yearPlayed?: number | null,
  hoursPlayed?: number | null,
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
