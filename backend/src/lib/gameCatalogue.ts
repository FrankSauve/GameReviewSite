import { Prisma } from "@prisma/client";

/**
 * The catalogue query, in SQL because two sorts are aggregates over reviews and
 * Prisma can only order by a relation's count.
 *
 * Selects ids, not rows: Prisma coerces a NULL scalar list to `[]` on read and
 * raw SQL does not, so `SELECT g.*` would hand GraphQL a null for the
 * non-nullable `Game.genres`.
 *
 * One filter serves both the listing and the count, so the paging controls
 * cannot describe a different set from the pages.
 */

export type GameSort =
  | "NEWEST"
  | "OLDEST"
  | "TITLE"
  | "RELEASE_YEAR"
  | "MOST_REVIEWED"
  | "HIGHEST_RATED"
  | "MOST_PLAYED";

export interface GameFilter {
  genre?: string | null | undefined;
  /** A user id or slug; games that user has reviewed. */
  reviewedBy?: string | null | undefined;
}

function whereFragment(filter: GameFilter): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];

  if (filter.genre) {
    clauses.push(Prisma.sql`${filter.genre} = ANY(g.genres)`);
  }
  if (filter.reviewedBy) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "Review" rf
      JOIN "User" uf ON uf.id = rf."userId"
      WHERE rf."gameId" = g.id
        AND (uf.id = ${filter.reviewedBy} OR uf.slug = ${filter.reviewedBy})
    )`);
  }

  if (clauses.length === 0) return Prisma.empty;
  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

/**
 * NULLS LAST on the aggregates so an unreviewed game sorts to the end rather
 * than the top, which is where Postgres puts NULL under DESC by default.
 */
const ORDER: Record<GameSort, Prisma.Sql> = {
  NEWEST: Prisma.sql`g."createdAt" DESC`,
  OLDEST: Prisma.sql`g."createdAt" ASC`,
  TITLE: Prisma.sql`LOWER(g.title) ASC`,
  RELEASE_YEAR: Prisma.sql`g."releaseYear" DESC NULLS LAST`,
  MOST_REVIEWED: Prisma.sql`COUNT(r.id) DESC`,
  HIGHEST_RATED: Prisma.sql`AVG(r.rating) DESC NULLS LAST`,
  MOST_PLAYED: Prisma.sql`SUM(r."hoursPlayed") DESC NULLS LAST`,
};

export const GAME_SORTS = Object.keys(ORDER) as GameSort[];

/**
 * `g.id` breaks ties under every sort, not just the aggregates. A bulk import
 * gives dozens of rows the same `createdAt`, and equal keys are free to come
 * back in a different order per query — which under paging means one game on
 * two pages and another on none.
 */
export function catalogueIds(
  filter: GameFilter,
  sort: GameSort,
  take: number,
  skip: number,
): Prisma.Sql {
  return Prisma.sql`
    SELECT g.id FROM "Game" g
    LEFT JOIN "Review" r ON r."gameId" = g.id
    ${whereFragment(filter)}
    GROUP BY g.id
    ORDER BY ${ORDER[sort]}, g.id ASC
    LIMIT ${take} OFFSET ${skip}
  `;
}

export function catalogueCount(filter: GameFilter): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::int AS count FROM "Game" g
    ${whereFragment(filter)}
  `;
}

/** Distinct genres across the catalogue, for the filter menu. */
export function genreValues(): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT unnest(genres) AS value FROM "Game" ORDER BY value ASC
  `;
}

/** Enforced on every write of `Game.title`; search reads it to refuse longer queries. */
export const TITLE_MAX = 200;

/** The trimmed query, or null when it cannot usefully match. */
export function searchableTitle(query: string): string | null {
  const trimmed = query.trim();
  return trimmed.length >= 2 && trimmed.length <= TITLE_MAX ? trimmed : null;
}

/** Escapes the LIKE metacharacters so a title search matches them literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Reviewed games only, most-reviewed first. The inner join is the filter: a game
 * imported and never reviewed is reached through "Add game", not here.
 */
export function titleSearchIds(query: string, take: number): Prisma.Sql {
  const pattern = `%${escapeLike(query)}%`;
  return Prisma.sql`
    SELECT g.id FROM "Game" g
    JOIN "Review" r ON r."gameId" = g.id
    WHERE g.title ILIKE ${pattern}
    GROUP BY g.id
    ORDER BY COUNT(r.id) DESC, LOWER(g.title) ASC, g.id ASC
    LIMIT ${take}
  `;
}
