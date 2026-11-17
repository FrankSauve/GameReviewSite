import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./prisma.js";
import { badInput } from "./badInput.js";
import { validateYearPlayed } from "./yearPlayed.js";

/**
 * Duplicated in frontend/src/lib/awards.ts for the editor; this copy is
 * authoritative and is the one that refuses a write.
 */
export const AWARD_RANK_MAX = 10;
export const AWARD_CATEGORY_MAX = 20;
export const AWARD_NAME_MAX = 60;

export interface YearAwardsInput {
  year: number;
  ranking: readonly string[];
  categories: readonly { name: string; gameId: string }[];
}

export interface YearAwardsRows {
  year: number;
  ranks: { rank: number; gameId: string }[];
  categories: { position: number; name: string; gameId: string }[];
}

/** Ranks are 1-based and positions 0-based, both taken from submitted order. */
export function normalizeYearAwards(input: YearAwardsInput): YearAwardsRows {
  const year = validateYearPlayed(input.year, "year");

  if (input.ranking.length > AWARD_RANK_MAX)
    throw badInput(`A ranking holds at most ${AWARD_RANK_MAX} games.`);
  if (new Set(input.ranking).size !== input.ranking.length)
    throw badInput("A game can appear in the ranking only once.");

  if (input.categories.length > AWARD_CATEGORY_MAX)
    throw badInput(`A year holds at most ${AWARD_CATEGORY_MAX} awards.`);
  const seen = new Set<string>();
  const categories = input.categories.map(({ name, gameId }, position) => {
    const trimmed = name.trim();
    if (!trimmed) throw badInput("Every award needs a name.");
    if (trimmed.length > AWARD_NAME_MAX)
      throw badInput(`An award name is at most ${AWARD_NAME_MAX} characters.`);
    const key = trimmed.toLowerCase();
    if (seen.has(key))
      throw badInput(`There is already an award called "${trimmed}".`);
    seen.add(key);
    return { position, name: trimmed, gameId };
  });

  return {
    year,
    ranks: input.ranking.map((gameId, i) => ({ rank: i + 1, gameId })),
    categories,
  };
}

/**
 * A game may be named only if the account reviewed it as played that year, or
 * it already holds one of the year's awards: a moved review never locks a year.
 */
async function assertAwardable(
  tx: Prisma.TransactionClient,
  where: { userId: string; year: number },
  gameIds: readonly string[],
): Promise<void> {
  const wanted = [...new Set(gameIds)];
  if (wanted.length === 0) return;
  const inWanted = { gameId: { in: wanted } };
  const select = { gameId: true } as const;
  const reviews = await tx.review.findMany({
    where: { userId: where.userId, yearPlayed: where.year, ...inWanted },
    select,
  });
  const ranks = await tx.awardRank.findMany({
    where: { ...where, ...inWanted },
    select,
  });
  const categories = await tx.awardCategory.findMany({
    where: { ...where, ...inWanted },
    select,
  });
  const allowed = new Set(
    [...reviews, ...ranks, ...categories].map((r) => r.gameId),
  );
  // One message for "no such game" and "not played then", so the field cannot
  // be used to probe which games exist.
  if (wanted.some((id) => !allowed.has(id)))
    throw badInput(
      `You can only give an award to a game you reviewed as played in ${where.year}.`,
    );
}

/** Replaces one account's awards for `rows.year`; empty lists clear it. */
export async function replaceYearAwards(
  userId: string,
  rows: YearAwardsRows,
): Promise<void> {
  const where = { userId, year: rows.year };
  await prisma.$transaction(async (tx) => {
    // Two saves queue here rather than trip the unique rank; NO KEY, so the
    // account's other foreign-key inserts are not held up behind it.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    await assertAwardable(tx, where, [
      ...rows.ranks.map((r) => r.gameId),
      ...rows.categories.map((c) => c.gameId),
    ]);
    await tx.awardRank.deleteMany({ where });
    await tx.awardCategory.deleteMany({ where });
    await tx.awardRank.createMany({
      data: rows.ranks.map((r) => ({ ...where, ...r })),
    });
    await tx.awardCategory.createMany({
      data: rows.categories.map((c) => ({ ...where, ...c })),
    });
  });
}

/** Per account, the years with at least one rank or award, newest first. */
export async function awardYearsOf(
  userIds: readonly string[],
): Promise<number[][]> {
  const where = { userId: { in: [...userIds] } };
  const [ranks, categories] = await Promise.all([
    prisma.awardRank.groupBy({ by: ["userId", "year"], where }),
    prisma.awardCategory.groupBy({ by: ["userId", "year"], where }),
  ]);
  const byUser = new Map<string, Set<number>>();
  for (const { userId, year } of [...ranks, ...categories]) {
    const years = byUser.get(userId) ?? new Set<number>();
    years.add(year);
    byUser.set(userId, years);
  }
  return userIds.map((id) => [...(byUser.get(id) ?? [])].sort((a, b) => b - a));
}

/** `${userId}:${year}`, the key a year's awards are batched and cached under. */
export function awardsKey(userId: string, year: number): string {
  return `${userId}:${year}`;
}

/** The rows for a batch of `awardsKey`s, one query per distinct year. */
export async function awardRowsByYear<T>(
  keys: readonly string[],
  find: (year: number, userIds: string[]) => Promise<T[]>,
): Promise<T[]> {
  const usersByYear = new Map<number, string[]>();
  for (const key of keys) {
    const at = key.lastIndexOf(":");
    const year = Number(key.slice(at + 1));
    const users = usersByYear.get(year) ?? [];
    users.push(key.slice(0, at));
    usersByYear.set(year, users);
  }
  const found = await Promise.all(
    [...usersByYear].map(([year, userIds]) => find(year, userIds)),
  );
  return found.flat();
}
