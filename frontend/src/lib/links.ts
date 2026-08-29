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
