/**
 * Clamped list windows. Every list field is bounded, nested ones included: the
 * schema is cyclic, so one unbounded list lets a fixed-size request ask for an
 * unbounded response. See lib/maxRows.ts for why armor does not cover this.
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
   * Higher than `reviews` because a summary carries no `content`: 500 summaries
   * is ~50 kB where 500 full reviews could be 10 MB. The default is 200 so a
   * decade of reviews loads in one request.
   */
  reviewSummaries: { def: 200, max: 500 },
  /**
   * Lower than the review lists, because an article is the longest thing anyone
   * writes here: the body cap is 50000 characters against a review's 20000, so
   * twenty of them is already a megabyte against the article budget.
   */
  articles: { def: 20, max: 50 },
} as const satisfies Record<string, Bounds>;

/**
 * `Review.reactions` and `Comment.reactions`. One entry per distinct emoji, not
 * per row, so this is far below the nested bounds — and it takes no arguments,
 * so `def` and `max` are the same number. lib/loaders.ts truncates to it.
 */
export const REACTION_BOUNDS: Bounds = { def: 24, max: 24 };

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
