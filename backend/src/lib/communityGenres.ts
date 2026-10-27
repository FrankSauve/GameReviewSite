import { MAX_LABELS } from "./labels.js";

/** How many of a game's reviews carry one spelling of a genre. */
export interface GenreTally {
  value: string;
  count: number;
}

/** What a game's reviewers filed it under, for the reviewers who did not. */
export interface CommunityGenres {
  genres: string[];
  secondaryGenres: string[];
}

export const NO_COMMUNITY_GENRES: CommunityGenres = {
  genres: [],
  secondaryGenres: [],
};

/**
 * One per genre ignoring case, in its commonest spelling, commonest first then
 * by name. Mirrors rankGenres() in frontend/src/lib/grouping.ts, which is
 * authoritative.
 */
function rank(tallies: GenreTally[]): string[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const { value, count } of tallies) {
    const spelling = value.trim();
    if (!spelling) continue;
    const key = spelling.toLowerCase();
    const spellings = byKey.get(key) ?? new Map<string, number>();
    spellings.set(spelling, (spellings.get(spelling) ?? 0) + count);
    byKey.set(key, spellings);
  }
  return [...byKey.values()]
    .map((spellings) => {
      let label = "";
      let best = 0;
      let total = 0;
      for (const [spelling, n] of spellings) {
        total += n;
        if (n > best || (n === best && spelling < label)) {
          label = spelling;
          best = n;
        }
      }
      return { label, total };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .map(({ label }) => label);
}

/** A secondary genre someone else filed as the genre is left out, so it is offered once. */
export function communityGenres(
  genres: GenreTally[],
  secondaryGenres: GenreTally[],
): CommunityGenres {
  const ranked = rank(genres);
  const taken = new Set(ranked.map((g) => g.toLowerCase()));
  return {
    genres: ranked.slice(0, MAX_LABELS),
    secondaryGenres: rank(secondaryGenres)
      .filter((g) => !taken.has(g.toLowerCase()))
      .slice(0, MAX_LABELS),
  };
}
