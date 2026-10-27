import { formatRating } from "./rating";

export interface ReviewSummary {
  id: string;
  slug?: string | null;
  rating: number;
  yearPlayed?: number | null;
  hoursPlayed?: number | null;
  createdAt: string;
  commentCount: number;
  /** The reviewer's own choice of genre, which wins over the game's. */
  genre?: string | null;
  /** Filtered by, never grouped by. */
  secondaryGenres?: string[];
  game?: {
    id: string;
    slug?: string | null;
    title: string;
    coverUrl?: string | null;
    releaseYear?: number | null;
    genres?: string[];
  } | null;
}

export interface ReviewGroup {
  /** Stable key for React, and for the anchor in the jump list. */
  key: string;
  label: string;
  items: ReviewSummary[];
  /** Mean score within the group. Equal to the group's own score when grouping by score. */
  average: number;
  /** Total hours recorded across the group, or null when none of them have any. */
  hours: number | null;
}

const UNKNOWN_KEY = "unknown";

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function totalHours(items: ReviewSummary[]): number | null {
  const recorded = items
    .map((i) => i.hoursPlayed)
    .filter((h): h is number => h != null);
  return recorded.length ? recorded.reduce((sum, h) => sum + h, 0) : null;
}

function toGroup(
  key: string,
  label: string,
  items: ReviewSummary[],
): ReviewGroup {
  return {
    key,
    label,
    items,
    average: mean(items.map((i) => i.rating)),
    hours: totalHours(items),
  };
}

/**
 * Groups by the year the game was played, newest first. Reviews with no
 * recorded year collect in a trailing "Unknown" group rather than being filed
 * under this year — the imported-backlog case.
 */
export function groupByYear(reviews: ReviewSummary[]): ReviewGroup[] {
  const byYear = new Map<number, ReviewSummary[]>();
  const unknown: ReviewSummary[] = [];

  for (const review of reviews) {
    if (review.yearPlayed == null) {
      unknown.push(review);
      continue;
    }
    const bucket = byYear.get(review.yearPlayed);
    if (bucket) bucket.push(review);
    else byYear.set(review.yearPlayed, [review]);
  }

  const groups = [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, items]) => toGroup(String(year), String(year), items));

  if (unknown.length)
    groups.push(toGroup(UNKNOWN_KEY, "Year unknown", unknown));
  return groups;
}

/** Groups by score, 10 down to 1 in half points. Only scores given get a heading. */
export function groupByScore(reviews: ReviewSummary[]): ReviewGroup[] {
  const byScore = new Map<number, ReviewSummary[]>();

  for (const review of reviews) {
    const bucket = byScore.get(review.rating);
    if (bucket) bucket.push(review);
    else byScore.set(review.rating, [review]);
  }

  return [...byScore.entries()]
    .sort(([a], [b]) => b - a)
    .map(([score, items]) =>
      toGroup(String(score), formatRating(score), items),
    );
}

/** Ties go to the lowest code point, which puts "RPG" ahead of "rpg". */
function commonestSpelling(spellings: Map<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [spelling, count] of spellings) {
    if (count > bestCount || (count === bestCount && spelling < best)) {
      best = spelling;
      bestCount = count;
    }
  }
  return best;
}

/** Counts each genre once per review, ignoring case. */
function tallyInto(tally: Map<string, number>, genres: string[]): void {
  for (const key of new Set(genres.map((genre) => genre.toLowerCase())))
    tally.set(key, (tally.get(key) ?? 0) + 1);
}

/** A fallback must be among this many games' genres, which keeps most headings off a single row. */
const MIN_FALLBACK_GROUP = 2;

/**
 * Picks the one genre each review is filed under. Only games the reviewer has
 * not filed themselves count towards a fallback's rarity.
 */
function genrePicker(
  reviews: ReviewSummary[],
): (review: ReviewSummary) => string | null {
  const chosen = new Map<string, number>();
  const unfiled = new Map<string, number>();
  for (const review of reviews) {
    const own = review.genre?.trim();
    if (own) tallyInto(chosen, [own]);
    else tallyInto(unfiled, review.game?.genres ?? []);
  }

  return (review) => {
    const own = review.genre?.trim();
    if (own) return own;
    const genres = review.game?.genres ?? [];
    return rarestShared(genres, chosen, unfiled) ?? genres[0] ?? null;
  };
}

/**
 * Rarest rather than commonest, so Action does not swallow the library. A genre
 * the reviewer files under skips the floor but not the rarity, or filing one game
 * under Action pulls in every other. Ties go to a filed genre, then the game's order.
 */
function rarestShared(
  genres: string[],
  chosen: Map<string, number>,
  unfiled: Map<string, number>,
): string | null {
  let best: string | null = null;
  let bestCount = Infinity;
  let bestFiled = false;
  for (const genre of genres) {
    const key = genre.toLowerCase();
    const count = unfiled.get(key) ?? 0;
    const filed = chosen.has(key);
    if (!filed && count < MIN_FALLBACK_GROUP) continue;
    if (count < bestCount || (count === bestCount && filed && !bestFiled)) {
      best = genre;
      bestCount = count;
      bestFiled = filed;
    }
  }
  return best;
}

/**
 * Groups by genre, one group per review, most games first, ties by name, with
 * "No genre" last.
 */
export function groupByGenre(
  reviews: ReviewSummary[],
  genreFor = genrePicker(reviews),
): ReviewGroup[] {
  // Case-insensitive, because genres are free text: "RPG" and "rpg" are one
  // group. Its name is the commonest spelling, so re-scoring a game cannot rename it.
  const byGenre = new Map<
    string,
    { spellings: Map<string, number>; items: ReviewSummary[] }
  >();
  const none: ReviewSummary[] = [];

  for (const review of reviews) {
    const genre = genreFor(review);
    if (genre == null) {
      none.push(review);
      continue;
    }
    const key = genre.toLowerCase();
    let bucket = byGenre.get(key);
    if (!bucket) {
      bucket = { spellings: new Map(), items: [] };
      byGenre.set(key, bucket);
    }
    bucket.items.push(review);
    bucket.spellings.set(genre, (bucket.spellings.get(genre) ?? 0) + 1);
  }

  // Keyed with a prefix so a genre named "unknown" cannot collide with UNKNOWN_KEY.
  const groups = [...byGenre.entries()]
    .map(([key, { spellings, items }]) =>
      toGroup(`genre:${key}`, commonestSpelling(spellings), items),
    )
    .sort(
      (a, b) =>
        b.items.length - a.items.length || a.label.localeCompare(b.label),
    );

  if (none.length) groups.push(toGroup(UNKNOWN_KEY, "No genre", none));
  return groups;
}

/** One per genre ignoring case, in its commonest spelling, commonest first then by name. */
function rankGenres(genres: string[]): string[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const genre of genres) {
    const key = genre.toLowerCase();
    let spellings = byKey.get(key);
    if (!spellings) {
      spellings = new Map();
      byKey.set(key, spellings);
    }
    spellings.set(genre, (spellings.get(genre) ?? 0) + 1);
  }
  return [...byKey.values()]
    .map((spellings) => ({
      label: commonestSpelling(spellings),
      count: [...spellings.values()].reduce((sum, n) => sum + n, 0),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map(({ label }) => label);
}

/**
 * What the review form offers: the reviewer's genre headings, biggest first,
 * spelled as the profile spells them, then their secondary genres, then the
 * game's genres not among them.
 */
export function genreSuggestions(
  reviews: ReviewSummary[],
  gameGenres: string[],
): string[] {
  const headings = groupByGenre(reviews)
    .filter((group) => group.key !== UNKNOWN_KEY)
    .map((group) => group.label);
  // Once per genre ignoring case: a game's genres can repeat, and the datalist keys on them.
  const taken = new Set<string>();
  return [
    ...headings,
    ...rankGenres(reviews.flatMap((r) => r.secondaryGenres ?? [])),
    ...gameGenres,
  ].filter((genre) => {
    const key = genre.toLowerCase();
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });
}

/** Each review's genres to filter by: its Genre-tab heading, then its secondary genres. */
function filterGenres(
  reviews: ReviewSummary[],
): (r: ReviewSummary) => string[] {
  // Over the whole list, so a heading is the one the unfiltered Genre tab shows.
  const genreFor = genrePicker(reviews);
  return (review) => {
    const heading = genreFor(review);
    return [...(heading ? [heading] : []), ...(review.secondaryGenres ?? [])];
  };
}

/** The reviews filed under `genre` or carrying it as a secondary genre, ignoring case. */
export function filterByGenre(
  reviews: ReviewSummary[],
  genre: string,
): ReviewSummary[] {
  const key = genre.trim().toLowerCase();
  if (!key) return reviews;
  const genresOf = filterGenres(reviews);
  return reviews.filter((review) =>
    genresOf(review).some((g) => g.toLowerCase() === key),
  );
}

/** What the profile's genre filter offers, most reviews first. */
export function genreFilterOptions(reviews: ReviewSummary[]): string[] {
  const genresOf = filterGenres(reviews);
  return rankGenres(
    reviews.flatMap((review) => {
      // Once per review: a fallback heading can repeat one of its secondary genres.
      const seen = new Set<string>();
      return genresOf(review).filter((g) => {
        const key = g.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }),
  );
}

export type Grouping = "year" | "score" | "genre" | "recent";

/** Groups the reviews matching `genre` (all of them when blank). */
export function groupReviews(
  reviews: ReviewSummary[],
  grouping: Grouping,
  genre = "",
): ReviewGroup[] {
  const shown = filterByGenre(reviews, genre);
  if (grouping === "year") return groupByYear(shown);
  if (grouping === "score") return groupByScore(shown);
  // Picked over every review, or a filtered one can change heading.
  if (grouping === "genre") return groupByGenre(shown, genrePicker(reviews));
  // Recent is one undivided list; the server has already ordered it.
  return shown.length ? [toGroup("recent", "", shown)] : [];
}

/** The server ordering each grouping needs. */
export const ORDER_FOR: Record<
  Grouping,
  "RECENT" | "RATING_DESC" | "YEAR_DESC"
> = {
  recent: "RECENT",
  year: "YEAR_DESC",
  score: "RATING_DESC",
  // Highest score first within each genre; shares the by-score cache entry.
  genre: "RATING_DESC",
};
