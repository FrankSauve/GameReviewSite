import type { ReviewSummary } from "./grouping";
import { pickableGames, type PickableGame } from "./favorites";
import { YEAR_PLAYED_MIN, yearPlayedMax } from "./playtime";

/**
 * Mirrors backend/src/lib/awards.ts, which is authoritative and refuses the
 * write; these only stop the editor offering what the API would refuse.
 */
export const AWARD_RANK_MAX = 10;
export const AWARD_CATEGORY_MAX = 20;
export const AWARD_NAME_MAX = 60;

/** Years a profile can have awards for, newest first. */
export function awardableYears(
  summaries: readonly ReviewSummary[],
  awardYears: readonly number[],
): number[] {
  const years = new Set(awardYears);
  for (const s of summaries) if (s.yearPlayed != null) years.add(s.yearPlayed);
  return [...years].sort((a, b) => b - a);
}

/** The newest year with awards, else the newest year played; null with neither. */
export function defaultAwardYear(
  summaries: readonly ReviewSummary[],
  awardYears: readonly number[],
): number | null {
  return (
    awardYears.reduce<number | null>(
      (max, y) => (max == null || y > max ? y : max),
      null,
    ) ??
    awardableYears(summaries, []).at(0) ??
    null
  );
}

/** The games eligible for a year's awards: reviewed with that yearPlayed. */
export function gamesPlayedIn(
  summaries: readonly ReviewSummary[],
  year: number,
): PickableGame[] {
  return pickableGames(summaries.filter((s) => s.yearPlayed === year));
}

/** A `:year` route segment, or null when it is not a year the API would accept. */
export function parseAwardYear(
  segment: string | undefined,
  now: Date = new Date(),
): number | null {
  if (!segment || !/^\d{4}$/.test(segment)) return null;
  const year = Number(segment);
  return year >= YEAR_PLAYED_MIN && year <= yearPlayedMax(now) ? year : null;
}

/** `years` with `year` added or removed, newest first, after a save. */
export function withAwardYear(
  years: readonly number[],
  year: number,
  hasAwards: boolean,
): number[] {
  const rest = years.filter((y) => y !== year);
  return (hasAwards ? [...rest, year] : rest).sort((a, b) => b - a);
}

export interface AwardDraft {
  ranking: PickableGame[];
  categories: { name: string; game: PickableGame | null }[];
}

/** The first thing the server would refuse, or null when the draft can save. */
export function draftProblem(draft: AwardDraft): string | null {
  if (draft.ranking.length > AWARD_RANK_MAX)
    return `A ranking holds at most ${AWARD_RANK_MAX} games.`;
  if (draft.categories.length > AWARD_CATEGORY_MAX)
    return `A year holds at most ${AWARD_CATEGORY_MAX} awards.`;
  const seen = new Set<string>();
  for (const { name, game } of draft.categories) {
    const trimmed = name.trim();
    if (!trimmed) return "Every award needs a name.";
    if (trimmed.length > AWARD_NAME_MAX)
      return `An award name is at most ${AWARD_NAME_MAX} characters.`;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return `There is already an award called "${trimmed}".`;
    seen.add(key);
    if (!game) return `Pick a winner for "${trimmed}".`;
  }
  return null;
}

/** Swaps the entry at `index` with its neighbour; out of range is a no-op. */
export function moveItem<T>(
  items: readonly T[],
  index: number,
  by: -1 | 1,
): T[] {
  const target = index + by;
  const next = [...items];
  const a = next[index];
  const b = next[target];
  if (a === undefined || b === undefined) return next;
  next[index] = b;
  next[target] = a;
  return next;
}
