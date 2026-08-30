/**
 * Readable URL slugs for games and reviews.
 *
 * Slugs replace the UUID in the URL only — primary keys are untouched, and every
 * lookup still accepts a UUID, so links shared before this change keep resolving.
 */

export const SLUG_MAX_LENGTH = 60;
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

/**
 * `alice/elden-ring`
 *
 * Stored whole in Review.slug, slash included, so the column stays a single
 * unique key and every lookup takes one string.
 */
export function reviewSlugBase(gameSlug: string, userSlug: string): string {
  return `${userSlug}/${gameSlug}`;
}

export async function uniqueSlug(
  base: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  if (!(await taken(base))) return base;
  for (let n = 2; n <= MAX_SUFFIX_ATTEMPTS; n++) {
    const candidate = `${base}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free slug for "${base}".`);
}

export function byIdOrSlug(key: string): {
  OR: ({ id: string } | { slug: string })[];
} {
  return { OR: [{ id: key }, { slug: key }] };
}
