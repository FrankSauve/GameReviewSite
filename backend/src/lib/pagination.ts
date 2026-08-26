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
 * The nested bounds are deliberately smaller than the root ones, because nested
 * lists multiply: they sit inside a list that is itself already paged. Fifty
 * reviews on one game, or fifty comments on one review, is well beyond anything
 * this site produces, and a caller that needs more can page for it.
 *
 * These bounds cap each list individually. What stops a query from multiplying
 * several capped lists together is the per-request row budget in lib/budget.ts.
 */
export const LIST_BOUNDS = {
  reviews: { def: 50, max: 100 },
  recentReviews: { def: 10, max: 50 },
  users: { def: 100, max: 200 },
  games: { def: 100, max: 200 },
  nested: { def: 50, max: 100 },
} as const satisfies Record<string, Bounds>;

function intOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

/** Turns caller-supplied paging arguments into a window that cannot exceed `max`. */
export function clampWindow(args: PageArgs | undefined, bounds: Bounds): ListWindow {
  const take = Math.min(Math.max(1, intOr(args?.limit, bounds.def)), bounds.max);
  const skip = Math.max(0, intOr(args?.offset, 0));
  return { take, skip };
}

/**
 * Applies a window to an already-loaded list.
 *
 * Nested lists arrive from a DataLoader that fetched one batch for every parent
 * in the request, so they are sliced in memory rather than by the database. The
 * loader itself reads at most `LIST_BOUNDS.nested.max` rows per parent, which is
 * what bounds the query — paging past that ceiling is empty by design.
 */
export function applyWindow<T>(rows: T[], window: ListWindow): T[] {
  return rows.slice(window.skip, window.skip + window.take);
}
