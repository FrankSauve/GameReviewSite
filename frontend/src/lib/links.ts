interface Slugged {
  id: string;
  slug?: string | null;
}



/** `/games/elden-ring`, or the home page when there is no game to link to. */
export function gamePath(game?: Slugged | null): string {
  return game ? `/games/${game.slug ?? game.id}` : "/";
}

/** `/reviews/alice/elden-ring`. The two segments live in the slug itself. */
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

/** `/articles/our-manifesto`. The index itself is at `/articles`. */
export function articlePath(article: Slugged): string {
  return `/articles/${article.slug ?? article.id}`;
}

/**
 * Served by the backend (backend/src/routes/export.ts), proxied like /graphql.
 * Nothing is appended: the server decides whose reviews to write from the
 * session.
 */
export const EXPORT_REVIEWS_PATH = "/export/reviews.zip";
