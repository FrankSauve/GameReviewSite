/**
 * Readable URL slugs for games and reviews.
 *
 * The site's URLs used to be UUIDs end to end, which made every link opaque:
 * `/games/8f14e45f-…` says nothing about the game, cannot be typed, and reads
 * badly when a review is pasted into a chat window. Slugs replace the UUID in the
 * URL only — the primary keys are untouched, and every lookup still accepts a
 * UUID so links shared before this change keep resolving.
 *
 * Slugs are generated once, at insert, and never regenerated. Renaming a game
 * therefore leaves its slug reading the old title, which is deliberate: a slug
 * that follows the title is a slug that breaks every link to it. The title in the
 * page is the thing people read; the slug only has to be stable and legible.
 */

/**
 * Long enough for a full game title, short enough that the URL stays readable.
 * The column is TEXT, so a disambiguating suffix may push a slug a few characters
 * past this — the cap is about legibility, not storage.
 */
export const SLUG_MAX_LENGTH = 60;

/** How many suffixes to try before giving up on disambiguating a slug. */
const MAX_SUFFIX_ATTEMPTS = 100;

/**
 * Turns arbitrary text into a URL-safe slug.
 *
 * NFKD decomposition splits an accented character into its base letter plus a
 * combining mark, and `\p{M}` then drops the mark — so "Pokémon" becomes
 * "pokemon" rather than "pok-mon". Anything that survives neither of those, such
 * as a title written entirely in a non-Latin script, slugifies to the empty
 * string and falls back rather than producing a bare `-`.
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

/**
 * The slug a review would have: the game's slug, then who wrote it.
 *
 * `createReview` allows one review per person per game, so this is unique on its
 * own for everything written through the app. It is still put through the
 * uniqueness check because nothing enforces that rule at the database level, and
 * because a username may repeat a slug that a truncated game title already used.
 */
export function reviewSlugBase(gameSlug: string, username: string): string {
  return `${gameSlug}-by-${slugify(username, "user")}`;
}

/**
 * Returns `base`, or the first `base-2`, `base-3`… that `taken` says is free.
 *
 * The unique index on the column is the real guard: two concurrent inserts can
 * both be told a candidate is free, and the loser gets a constraint violation
 * rather than a duplicate slug. On a site where inserts are one person importing
 * one game at a time, losing that race is not a case worth writing retry logic
 * for — it surfaces as an error the caller can repeat.
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
 * The `id` columns are `String @id @default(uuid())`, so they are TEXT in
 * Postgres and comparing one to a slug is a plain string comparison rather than a
 * cast that could fail. Testing the shape of the key first and picking a column
 * would be one index lookup instead of two, but it would also mean a game whose
 * title happens to slugify into the shape of a UUID stops resolving.
 */
export function byIdOrSlug(key: string): {
  OR: ({ id: string } | { slug: string })[];
} {
  return { OR: [{ id: key }, { slug: key }] };
}

/** The same, for users, whose readable identifier is their unique username. */
export function byIdOrUsername(key: string): {
  OR: ({ id: string } | { username: string })[];
} {
  return { OR: [{ id: key }, { username: key }] };
}
