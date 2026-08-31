import DataLoader from "dataloader";
import type { Comment, Game, Review, User } from "@prisma/client";
import { prisma } from "./prisma.js";
import { LIST_BOUNDS, REACTION_BOUNDS } from "./pagination.js";

/**
 * Per-request batching for the relation fields. Built per request, never per
 * process: a DataLoader caches for its lifetime, so a shared one would serve
 * stale rows and, for the email field, rows loaded under another caller's auth.
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
  /** Counts per emoji, never the rows. Truncated to REACTION_BOUNDS.max. */
  reactionsByReviewId: DataLoader<string, ReactionSummary[]>;
  reactionsByCommentId: DataLoader<string, ReactionSummary[]>;
}

/** One emoji on one parent: how many put it there, and whether the viewer did. */
export interface ReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
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

interface ReactionGroup {
  parentId: string | null;
  emoji: string;
  count: number;
}

/**
 * Buckets the aggregate rows by parent, most-reacted first, and marks the ones
 * the viewer put there. Truncated so the static row rule in lib/maxRows.ts
 * stays honest: a parent can carry more distinct emoji than the bound allows.
 */
function summarise(
  ids: readonly string[],
  groups: ReactionGroup[],
  mine: Set<string>,
  parent: "reviewId" | "commentId",
): ReactionSummary[][] {
  const buckets = new Map<string, ReactionSummary[]>();
  for (const group of groups) {
    if (group.parentId === null) continue;
    const bucket = buckets.get(group.parentId) ?? [];
    bucket.push({
      emoji: group.emoji,
      count: group.count,
      reacted: mine.has(`${parent}:${group.parentId}:${group.emoji}`),
    });
    buckets.set(group.parentId, bucket);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
    bucket.splice(REACTION_BOUNDS.max);
  }
  return ids.map((id) => buckets.get(id) ?? []);
}

/** The viewer's own rows, keyed so `summarise` can look one up per group. */
async function ownReactions(
  parent: "reviewId" | "commentId",
  ids: readonly string[],
  viewerId: string | null,
): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const rows = await prisma.reaction.findMany({
    where:
      parent === "reviewId"
        ? { userId: viewerId, reviewId: { in: [...ids] } }
        : { userId: viewerId, commentId: { in: [...ids] } },
    select: { reviewId: true, commentId: true, emoji: true },
  });
  return new Set(
    rows.map((row) => `${parent}:${row[parent] ?? ""}:${row.emoji}`),
  );
}

/**
 * `viewerId` is baked in because `reacted` is viewer-dependent: a loader shared
 * between requests would report one visitor's reactions to the next.
 */
export function createLoaders(viewerId: string | null): Loaders {
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

    reactionsByReviewId: new DataLoader(async (reviewIds) => {
      const grouped = await prisma.reaction.groupBy({
        by: ["reviewId", "emoji"],
        where: { reviewId: { in: [...reviewIds] } },
        _count: { _all: true },
      });
      const groups = grouped.map((g) => ({
        parentId: g.reviewId,
        emoji: g.emoji,
        count: g._count._all,
      }));
      const mine = await ownReactions("reviewId", reviewIds, viewerId);
      return summarise(reviewIds, groups, mine, "reviewId");
    }),

    reactionsByCommentId: new DataLoader(async (commentIds) => {
      const grouped = await prisma.reaction.groupBy({
        by: ["commentId", "emoji"],
        where: { commentId: { in: [...commentIds] } },
        _count: { _all: true },
      });
      const groups = grouped.map((g) => ({
        parentId: g.commentId,
        emoji: g.emoji,
        count: g._count._all,
      }));
      const mine = await ownReactions("commentId", commentIds, viewerId);
      return summarise(commentIds, groups, mine, "commentId");
    }),
  };
}
