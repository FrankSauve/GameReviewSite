interface Slugged {
  id: string;
  slug?: string | null;
}

/**
 * Whether a route's `:id` names this record. It may be either the slug or the
 * UUID, since a link shared before slugs existed still resolves.
 */
export function isKeyOf(record: Slugged, key?: string | null): boolean {
  return key != null && (record.id === key || record.slug === key);
}

/** `/games/elden-ring`, or the home page when there is no game to link to. */
export function gamePath(game?: Slugged | null): string {
  return game ? `/games/${game.slug ?? game.id}` : "/";
}

/** A RAWG title not yet in the library: the page that writes its first review. */
export function newGamePath(rawgId: string): string {
  return `/games/new/${encodeURIComponent(rawgId)}`;
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
