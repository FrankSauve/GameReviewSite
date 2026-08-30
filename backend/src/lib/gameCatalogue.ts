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
  reviewedOnly?: boolean | null;
  genre?: string | null;
  platform?: string | null;
  /** A user id or slug; games that user has reviewed. */
  reviewedBy?: string | null;
}

function whereFragment(filter: GameFilter): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];

  if (filter.reviewedOnly) {
    clauses.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Review" rf WHERE rf."gameId" = g.id)`
    );
  }
  if (filter.genre) {
    clauses.push(Prisma.sql`${filter.genre} = ANY(g.genres)`);
  }
  if (filter.platform) {
    clauses.push(Prisma.sql`${filter.platform} = ANY(g.platforms)`);
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
  skip: number
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

/** Distinct labels across the catalogue, for the filter menus. */
export function labelValues(column: "genres" | "platforms"): Prisma.Sql {
  const col =
    column === "genres" ? Prisma.sql`genres` : Prisma.sql`platforms`;
  return Prisma.sql`
    SELECT DISTINCT unnest(${col}) AS value FROM "Game" ORDER BY value ASC
  `;
}
