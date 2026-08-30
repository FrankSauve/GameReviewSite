import { GraphQLError } from "graphql";
import { Prisma, type Review } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeDates } from "../lib/serialize.js";
import {
  LIST_BOUNDS,
  applyWindow,
  clampWindow,
  type PageArgs,
} from "../lib/pagination.js";
import { requireAuth, type Context } from "../context.js";
import { byIdOrSlug, reviewSlugBase, uniqueSlug } from "../lib/slug.js";
import { validateString } from "../lib/validate.js";
import { badInput } from "../lib/badInput.js";

interface CreateReviewInput {
  gameId: string;
  rating: number;
  content: string;
  yearPlayed: number;
  hoursPlayed: number;
}

interface UpdateReviewInput {
  rating?: number;
  content?: string;
  yearPlayed?: number;
  hoursPlayed?: number;
}

/** Generous because a decade of backlog includes long reviews. */
export const REVIEW_CONTENT_MAX = 20000;

/**
 * Scores are whole or half points on a 1–10 scale: 9.5 is a score, 9.4 is a typo.
 *
 * Off-step values are refused, never snapped — silently altering an imported
 * score is the failure hardest to notice. `x * 2` is exact for halves in binary
 * floating point, so this needs no epsilon.
 */
export const RATING_MIN = 1;
export const RATING_MAX = 10;

function validateRating(rating: number): number {
  const num = Number(rating);
  if (!Number.isFinite(num) || num < RATING_MIN || num > RATING_MAX)
    throw badInput(`rating must be between ${RATING_MIN} and ${RATING_MAX}.`);
  if (!Number.isInteger(num * 2))
    throw badInput("rating must be a whole or half point, such as 9 or 9.5.");
  return num;
}

export const YEAR_PLAYED_MIN = 1970;

function validateYearPlayed(year: number): number {
  const num = Number(year);
  const max = new Date().getFullYear() + 1;
  if (!Number.isInteger(num) || num < YEAR_PLAYED_MIN || num > max)
    throw badInput(
      `yearPlayed must be a whole year between ${YEAR_PLAYED_MIN} and ${max}.`
    );
  return num;
}

/**
 * Hours spent with the game, to one decimal.
 */
export const HOURS_PLAYED_MAX = 30000;

function validateHoursPlayed(hours: number): number {
  const num = Number(hours);
  if (!Number.isFinite(num) || num <= 0 || num > HOURS_PLAYED_MAX)
    throw badInput(
      `hoursPlayed must be greater than 0 and at most ${HOURS_PLAYED_MAX}.`
    );
  return Math.round(num * 10) / 10;
}

/**
 * Orderings `reviewSummariesByUser` accepts. Each falls back to a second key so
 * paging cannot reshuffle equal rows, and `nulls: "last"` keeps undated reviews
 * below this year's — Postgres puts nulls first under DESC.
 */
type ReviewOrder = "RECENT" | "RATING_DESC" | "YEAR_DESC";

const ORDER_BY: Record<ReviewOrder, Prisma.ReviewOrderByWithRelationInput[]> = {
  RECENT: [{ createdAt: "desc" }],
  RATING_DESC: [{ rating: "desc" }, { createdAt: "desc" }],
  YEAR_DESC: [
    { yearPlayed: { sort: "desc", nulls: "last" } },
    { createdAt: "desc" },
  ],
};

export const reviewResolvers = {
  Query: {
    reviews: async (_parent: unknown, args: PageArgs, { budget }: Context) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.reviews);
      const reviews = await prisma.review.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },

    review: async (_parent: unknown, { id }: { id: string }) => {
      const review = await prisma.review.findFirst({ where: byIdOrSlug(id) });
      return review ? serializeDates(review) : null;
    },

    recentReviews: async (_parent: unknown, args: PageArgs, { budget }: Context) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.recentReviews);
      const reviews = await prisma.review.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },

    recentReviewsCount: async () => {
      return prisma.review.count();
    },

    reviewsByGame: async (
      _parent: unknown,
      { gameId, ...args }: { gameId: string } & PageArgs,
      { budget }: Context
    ) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.reviews);
      const reviews = await prisma.review.findMany({
        where: { game: byIdOrSlug(gameId) },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },

    reviewsByUser: async (
      _parent: unknown,
      { userId, ...args }: { userId: string } & PageArgs,
      { budget }: Context
    ) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.reviews);
      const reviews = await prisma.review.findMany({
        where: { user: byIdOrSlug(userId) },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },

    /**
     * A user's reviews without their bodies. Grouping happens in the browser:
     * the buckets are presentation, and a nested group shape prices badly
     * against the static row rule for no benefit.
     */
    reviewSummariesByUser: async (
      _parent: unknown,
      {
        userId,
        order = "RECENT",
        ...args
      }: { userId: string; order?: ReviewOrder } & PageArgs,
      { budget }: Context
    ) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.reviewSummaries);
      const reviews = await prisma.review.findMany({
        where: { user: byIdOrSlug(userId) },
        orderBy: ORDER_BY[order] ?? ORDER_BY.RECENT,
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },
  },

  Mutation: {
    createReview: async (
      _parent: unknown,
      { input }: { input: CreateReviewInput },
      context: Context
    ) => {
      const authUser = requireAuth(context);

      const game = await prisma.game.findUnique({ where: { id: input.gameId } });
      if (!game)
        throw new GraphQLError("Game not found.", { extensions: { code: "NOT_FOUND" } });

      const existing = await prisma.review.findFirst({
        where: { userId: authUser.id, gameId: input.gameId },
      });
      if (existing)
        throw badInput("You have already reviewed this game.");

      const review = await prisma.review.create({
        data: {
          slug: await uniqueSlug(
            reviewSlugBase(game.slug, authUser.slug),
            async (candidate) =>
              (await prisma.review.count({ where: { slug: candidate } })) > 0
          ),
          userId: authUser.id,
          gameId: input.gameId,
          rating: validateRating(input.rating),
          content: validateString(input.content, "content", REVIEW_CONTENT_MAX),
          yearPlayed: validateYearPlayed(input.yearPlayed),
          hoursPlayed: validateHoursPlayed(input.hoursPlayed),
        },
      });
      return serializeDates(review);
    },

    updateReview: async (
      _parent: unknown,
      { id, input }: { id: string; input: UpdateReviewInput },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      const existing = await requireOwnership(id, authUser.id);
      const data: Partial<
        Pick<Review, "rating" | "content" | "yearPlayed" | "hoursPlayed">
      > = {};
      if (input.rating !== undefined) data.rating = validateRating(input.rating);
      if (input.content !== undefined)
        data.content = validateString(input.content, "content", REVIEW_CONTENT_MAX);
      if (input.yearPlayed !== undefined)
        data.yearPlayed = validateYearPlayed(input.yearPlayed);
      if (input.hoursPlayed !== undefined)
        data.hoursPlayed = validateHoursPlayed(input.hoursPlayed);
      const review = await prisma.review.update({ where: { id: existing.id }, data });
      return serializeDates(review);
    },

    deleteReview: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      await requireOwnership(id, authUser.id);
      await prisma.review.delete({ where: { id } });
      return true;
    },
  },

  /**
   * Reuses `Review`'s loaders, so 200 summaries are two batched queries.
   * Deliberately not spread from it: that object has a `content` resolver and
   * `ReviewSummary` has no such field.
   */
  ReviewSummary: {
    game: async (parent: Review, _args: unknown, { loaders }: Context) => {
      const game = await loaders.gameById.load(parent.gameId);
      return game ? serializeDates(game) : null;
    },

    commentCount: async (parent: Review, _args: unknown, { loaders }: Context) =>
      (await loaders.commentsByReviewId.load(parent.id)).length,
  },

  Review: {
    /**
     * Charges the request's text budget. Every path that returns a review body —
     * the four root queries, plus `User.reviews` and `Game.reviews` — resolves it
     * through here, so one interception covers all of them.
     */
    content: (parent: Review, _args: unknown, { budget }: Context) =>
      budget.chargeText(parent.content),

    user: async (parent: Review, _args: unknown, { loaders }: Context) => {
      const user = await loaders.userById.load(parent.userId);
      return user ? serializeDates(user) : null;
    },

    game: async (parent: Review, _args: unknown, { loaders }: Context) => {
      const game = await loaders.gameById.load(parent.gameId);
      return game ? serializeDates(game) : null;
    },

    comments: async (parent: Review, args: PageArgs, { loaders, budget }: Context) => {
      const comments = await loaders.commentsByReviewId.load(parent.id);
      const page = applyWindow(comments, clampWindow(args, LIST_BOUNDS.nested));
      return budget.charge(page).map(serializeDates);
    },

    commentCount: async (parent: Review, _args: unknown, { loaders }: Context) => {
      const comments = await loaders.commentsByReviewId.load(parent.id);
      return comments.length;
    },
  },
};

async function requireOwnership(reviewId: string, userId: string): Promise<Review> {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review)
    throw new GraphQLError("Review not found.", { extensions: { code: "NOT_FOUND" } });
  if (review.userId !== userId)
    throw new GraphQLError("You can only modify your own reviews.", {
      extensions: { code: "FORBIDDEN" },
    });
  return review;
}
