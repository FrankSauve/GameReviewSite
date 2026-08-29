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
 * `/users/alice`, optionally with one of the profile view tabs appended.
 */
export function userPath(user?: Slugged | null, tab = ""): string {
  if (!user) return "#";
  return `/users/${user.slug ?? user.id}${tab ? `/${tab}` : ""}`;
}

/** `/texts/our-manifesto`. The index itself is at `/texts`. */
export function textPath(article: Slugged): string {
  return `/texts/${article.slug ?? article.id}`;
}

/**
 * The markdown export of your own reviews.
 *
 * Served by the backend rather than the SPA — see backend/src/routes/export.ts —
 * so it is a same-origin path here for the same reason /graphql is: vite proxies
 * it in development and the reverse proxy forwards it in production. Nothing is
 * appended to it; the server decides whose reviews to write from the session.
 */
export const EXPORT_REVIEWS_PATH = "/export/reviews.md";
