/**
 * Readable URL slugs for games and reviews.
 *
 * Slugs replace the UUID in the URL only — primary keys are untouched, and every
 * lookup still accepts a UUID, so links shared before this change keep resolving.
 * Slugs are generated at insert and never regenerated: a slug that follows the
 * title is a slug that breaks every link to it when the title is edited.
 */

export const SLUG_MAX_LENGTH = 60;

/** How many suffixes to try before giving up on disambiguating a slug. */
const MAX_SUFFIX_ATTEMPTS = 100;

/**
 * Turns arbitrary text into a URL-safe slug.
 *
 * NFKD splits an accented character into base letter plus combining mark and
 * `\p{M}` drops the mark, so "Pokémon" becomes "pokemon" rather than "pok-mon".
 * Text that survives neither — a title in a non-Latin script — falls back.
 */
export function slugify(input: string, fallback = "untitled"): string {
  const slug = input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
  return slug || fallback;
}

/** The slug a review would have: the game's slug, then who wrote it. */
export function reviewSlugBase(gameSlug: string, userSlug: string): string {
  return `${gameSlug}-by-${userSlug}`;
}

/**
 * Returns `base`, or the first `base-2`, `base-3`… that `taken` says is free.
 *
 * The unique index is the real guard: two concurrent inserts can both be told a
 * candidate is free, and the loser gets a constraint violation rather than a
 * duplicate. At one import at a time, that race is not worth retry logic.
 */
export async function uniqueSlug(
  base: string,
  taken: (candidate: string) => Promise<boolean>
): Promise<string> {
  if (!(await taken(base))) return base;
  for (let n = 2; n <= MAX_SUFFIX_ATTEMPTS; n++) {
    const candidate = `${base}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free slug for "${base}".`);
}

/**
 * Matches a URL segment against either identifier a link may carry.
 *
 * `id` is TEXT in Postgres, so comparing it to a slug is a plain string
 * comparison rather than a cast that could fail. Testing the shape of the key
 * and picking one column would be one index lookup instead of two, but a game
 * whose title slugifies into the shape of a UUID would stop resolving.
 */
export function byIdOrSlug(key: string): {
  OR: ({ id: string } | { slug: string })[];
} {
  return { OR: [{ id: key }, { slug: key }] };
}
