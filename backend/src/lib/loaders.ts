import DataLoader from "dataloader";
import type { Comment, Game, Review, User } from "@prisma/client";
import { prisma } from "./prisma.js";
import { LIST_BOUNDS } from "./pagination.js";

/**
 * Per-request batching for the relation fields.
 *
 * Loaders are built per request, not per process: a DataLoader caches for its
 * lifetime, and a process-wide cache would serve one request stale rows written
 * by another — and, for the email field, would risk serving one caller a row
 * loaded while a different caller was authenticated.
 */
export interface Loaders {
  userById: DataLoader<string, User | null>;
  gameById: DataLoader<string, Game | null>;
  /** Bounded at LIST_BOUNDS.nested.max rows per parent. */
  reviewsByUserId: DataLoader<string, Review[]>;
  reviewsByGameId: DataLoader<string, Review[]>;
  commentsByReviewId: DataLoader<string, Comment[]>;
  /** Aggregates, so a count or an average never loads the rows it summarises. */
  reviewStatsByUserId: DataLoader<string, ReviewStats>;
  reviewStatsByGameId: DataLoader<string, ReviewStats>;
}

export interface ReviewStats {
  count: number;
  average: number | null;
}

const NO_STATS: ReviewStats = { count: 0, average: null };

/** Groups rows by a foreign key, truncating each group to the nested ceiling. */
function groupBy<T>(
  rows: T[],
  key: (row: T) => string,
  ids: readonly string[],
): T[][] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const bucket = buckets.get(id);
    if (bucket) {
      if (bucket.length < LIST_BOUNDS.nested.max) bucket.push(row);
    } else {
      buckets.set(id, [row]);
    }
  }
  return ids.map((id) => buckets.get(id) ?? []);
}

/** Re-orders a findMany result to line up with the keys DataLoader asked for. */
function alignById<T extends { id: string }>(
  rows: T[],
  ids: readonly string[],
): (T | null)[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id) ?? null);
}

export function createLoaders(): Loaders {
  return {
    userById: new DataLoader(async (ids) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
      });
      return alignById(users, ids);
    }),

    gameById: new DataLoader(async (ids) => {
      const games = await prisma.game.findMany({
        where: { id: { in: [...ids] } },
      });
      return alignById(games, ids);
    }),

    reviewsByUserId: new DataLoader(async (userIds) => {
      const reviews = await prisma.review.findMany({
        where: { userId: { in: [...userIds] } },
        orderBy: { createdAt: "desc" },
        // Ceiling across the whole batch as well as per parent, so a request
        // touching many users cannot read the entire table either.
        take: LIST_BOUNDS.nested.max * userIds.length,
      });
      return groupBy(reviews, (r) => r.userId, userIds);
    }),

    reviewsByGameId: new DataLoader(async (gameIds) => {
      const reviews = await prisma.review.findMany({
        where: { gameId: { in: [...gameIds] } },
        orderBy: { createdAt: "desc" },
        take: LIST_BOUNDS.nested.max * gameIds.length,
      });
      return groupBy(reviews, (r) => r.gameId, gameIds);
    }),

    commentsByReviewId: new DataLoader(async (reviewIds) => {
      const comments = await prisma.comment.findMany({
        where: { reviewId: { in: [...reviewIds] } },
        orderBy: { createdAt: "asc" },
        take: LIST_BOUNDS.nested.max * reviewIds.length,
      });
      return groupBy(comments, (c) => c.reviewId, reviewIds);
    }),

    reviewStatsByUserId: new DataLoader(async (userIds) => {
      const grouped = await prisma.review.groupBy({
        by: ["userId"],
        where: { userId: { in: [...userIds] } },
        _count: { _all: true },
        _avg: { rating: true },
      });
      const byId = new Map(
        grouped.map((g) => [
          g.userId,
          {
            count: g._count._all,
            average: g._avg.rating,
          } satisfies ReviewStats,
        ]),
      );
      return userIds.map((id) => byId.get(id) ?? NO_STATS);
    }),

    reviewStatsByGameId: new DataLoader(async (gameIds) => {
      const grouped = await prisma.review.groupBy({
        by: ["gameId"],
        where: { gameId: { in: [...gameIds] } },
        _count: { _all: true },
        _avg: { rating: true },
      });
      const byId = new Map(
        grouped.map((g) => [
          g.gameId,
          {
            count: g._count._all,
            average: g._avg.rating,
          } satisfies ReviewStats,
        ]),
      );
      return gameIds.map((id) => byId.get(id) ?? NO_STATS);
    }),
  };
}
