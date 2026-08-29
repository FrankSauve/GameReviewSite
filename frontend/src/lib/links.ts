/**
 * The one place that knows what a link to a game, review or profile looks like.
 *
 * The id fallback is not theoretical: the API declares `slug` non-null, but a
 * component reading a cache entry from a query that omitted the field sees
 * `undefined`. The server accepts either, so falling back keeps the link working
 * instead of routing to `/games/undefined`.
 */

interface Slugged {
  id: string;
  slug?: string | null;
}



/** `/games/elden-ring`, or the home page when there is no game to link to. */
export function gamePath(game?: Slugged | null): string {
  return game ? `/games/${game.slug ?? game.id}` : "/";
}

/** `/reviews/elden-ring-by-alice`. */
export function reviewPath(review: Slugged): string {
  return `/reviews/${review.slug ?? review.id}`;
}

/**
 * `/users/alice`, optionally with one of the profile view tabs appended. "#" for
 * a missing user: a review whose author deleted their account still renders, and
 * its byline should not navigate anywhere.
 */
export function userPath(user?: Slugged | null, tab = ""): string {
  if (!user) return "#";
  return `/users/${user.slug ?? user.id}${tab ? `/${tab}` : ""}`;
}
