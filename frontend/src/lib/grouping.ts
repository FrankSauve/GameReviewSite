import { formatRating } from "./rating";

export interface ReviewSummary {
  id: string;
  slug?: string | null;
  rating: number;
  yearPlayed?: number | null;
  hoursPlayed?: number | null;
  createdAt: string;
  commentCount: number;
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

function toGroup(key: string, label: string, items: ReviewSummary[]): ReviewGroup {
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

  if (unknown.length) groups.push(toGroup(UNKNOWN_KEY, "Year unknown", unknown));
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
    .map(([score, items]) => toGroup(String(score), formatRating(score), items));
}

export type Grouping = "year" | "score" | "recent";

export function groupReviews(
  reviews: ReviewSummary[],
  grouping: Grouping
): ReviewGroup[] {
  if (grouping === "year") return groupByYear(reviews);
  if (grouping === "score") return groupByScore(reviews);
  // Recent is one undivided list; the server has already ordered it.
  return reviews.length ? [toGroup("recent", "", reviews)] : [];
}

/** The server ordering each grouping needs. */
export const ORDER_FOR: Record<Grouping, "RECENT" | "RATING_DESC" | "YEAR_DESC"> = {
  recent: "RECENT",
  year: "YEAR_DESC",
  score: "RATING_DESC",
};
