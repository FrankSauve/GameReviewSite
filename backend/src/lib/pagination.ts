/**
 * Clamped list windows.
 *
 * Every list field is bounded, including the nested ones. A review carries a
 * user, a user carries reviews, and a review carries comments, so an unbounded
 * list anywhere in that cycle lets a request whose own size is fixed ask for a
 * response whose size is not: a 249-byte query returned 2.6 MB before these
 * bounds existed. graphql-armor's cost limit does not catch it, because cost is
 * scored from the shape of the query and this abuse is entirely in the
 * cardinality of the result.
 */

export interface PageArgs {
  limit?: number | null;
  offset?: number | null;
}

export interface ListWindow {
  take: number;
  skip: number;
}

export interface Bounds {
  /** Applied when the caller passes no limit. */
  def: number;
  /** Ceiling the caller cannot raise. */
  max: number;
}

/**
 * `def` is what an argument-less query gets, `max` is the hard ceiling.
 *
 * The nested bounds are deliberately smaller than the root ones.
 */
export const LIST_BOUNDS = {
  reviews: { def: 50, max: 100 },
  recentReviews: { def: 10, max: 50 },
  users: { def: 100, max: 200 },
  games: { def: 100, max: 200 },
  nested: { def: 50, max: 100 },
  /**
   * Higher than `reviews` on purpose: a review summary carries no `content`, which
   * is the field the other bounds are small to contain. 500 rows of summary is
   * roughly 50 kB, where 500 full reviews could be 10 MB.
   *
   * The default is 200 rather than the maximum so a profile with a decade of
   * reviews loads in one request without a caller having to know to ask.
   */
  reviewSummaries: { def: 200, max: 500 },
  /**
   * Lower than the review lists, because an article is the longest thing anyone
   * writes here: the body cap is 50000 characters against a review's 20000, so
   * twenty of them is already a megabyte against the article budget.
   */
  articles: { def: 20, max: 50 },
} as const satisfies Record<string, Bounds>;

function intOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

/** Turns caller-supplied paging arguments into a window that cannot exceed `max`. */
export function clampWindow(
  args: PageArgs | undefined,
  bounds: Bounds,
): ListWindow {
  const take = Math.min(
    Math.max(1, intOr(args?.limit, bounds.def)),
    bounds.max,
  );
  const skip = Math.max(0, intOr(args?.offset, 0));
  return { take, skip };
}

/** Applies a window to an already-loaded list. */
export function applyWindow<T>(rows: T[], window: ListWindow): T[] {
  return rows.slice(window.skip, window.skip + window.take);
}
