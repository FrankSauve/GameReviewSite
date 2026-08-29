/**
 * The one place that knows what a link to a game, review or profile looks like.
 *
 * URLs used to be built inline from UUIDs at about twenty call sites. Now that
 * they carry a readable slug, and that slug has to fall back to the UUID when it
 * is missing, building them by hand in each component is twenty chances to get
 * the fallback wrong.
 *
 * The fallback is not theoretical. The API declares `slug` non-null, but Apollo
 * hands back whatever the query asked for, so a component reading a cache entry
 * populated by a query that omitted the field sees `undefined`. Falling back to
 * the id keeps the link working — the server accepts either — instead of routing
 * to `/games/undefined`.
 */

interface Slugged {
  id: string;
  slug?: string | null;
}

interface Named {
  id: string;
  username?: string | null;
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
 * `/users/alice`, optionally with one of the profile view tabs appended.
 *
 * Returns "#" for a missing user, which is what the call sites did before: a
 * review whose author has deleted their account still renders, and its byline
 * should not navigate anywhere.
 */
export function userPath(user?: Named | null, tab = ""): string {
  if (!user) return "#";
  return `/users/${user.username ?? user.id}${tab ? `/${tab}` : ""}`;
}
