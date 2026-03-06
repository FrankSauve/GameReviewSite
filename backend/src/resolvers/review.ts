import { GraphQLError } from "graphql";
import type { Review } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { serializeDates } from "../lib/serialize";
import { requireAuth, type Context } from "../context";

interface CreateReviewInput {
  gameId: string;
  rating: number;
  content: string;
}

interface UpdateReviewInput {
  rating?: number;
  content?: string;
}

function validateString(value: string, field: string, maxLength = 5000): string {
  const trimmed = value.trim();
  if (!trimmed) throw new GraphQLError(`${field} must not be empty.`);
  if (trimmed.length > maxLength)
    throw new GraphQLError(`${field} must be at most ${maxLength} characters.`);
  return trimmed;
}

function validateRating(rating: number): number {
  const num = Number(rating);
  if (isNaN(num) || num < 0 || num > 10)
    throw new GraphQLError("rating must be between 0 and 10.");
  return Math.round(num * 10) / 10;
}

export const reviewResolvers = {
  Query: {
    reviews: async () => {
      const reviews = await prisma.review.findMany({ orderBy: { createdAt: "desc" } });
      return reviews.map(serializeDates);
    },

    review: async (_parent: unknown, { id }: { id: string }) => {
      const review = await prisma.review.findUnique({ where: { id } });
      return review ? serializeDates(review) : null;
    },

    recentReviews: async (_parent: unknown, { limit, offset }: { limit?: number; offset?: number }) => {
      const take = Math.min(Math.max(1, limit ?? 10), 50);
      const skip = Math.max(0, offset ?? 0);
      const reviews = await prisma.review.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return reviews.map(serializeDates);
    },

    recentReviewsCount: async () => {
      return prisma.review.count();
    },

    reviewsByGame: async (_parent: unknown, { gameId }: { gameId: string }) => {
      const reviews = await prisma.review.findMany({
        where: { gameId },
        orderBy: { createdAt: "desc" },
      });
      return reviews.map(serializeDates);
    },

    reviewsByUser: async (_parent: unknown, { userId }: { userId: string }) => {
      const reviews = await prisma.review.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      return reviews.map(serializeDates);
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
        throw new GraphQLError("You have already reviewed this game.");

      const review = await prisma.review.create({
        data: {
          userId: authUser.id,
          gameId: input.gameId,
          rating: validateRating(input.rating),
          content: validateString(input.content, "content"),
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
      const data: Partial<Pick<Review, "rating" | "content">> = {};
      if (input.rating !== undefined) data.rating = validateRating(input.rating);
      if (input.content !== undefined)
        data.content = validateString(input.content, "content");
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

  Review: {
    user: async (parent: Review) => {
      const user = await prisma.user.findUnique({ where: { id: parent.userId } });
      return user ? serializeDates(user) : null;
    },

    game: async (parent: Review) => {
      const game = await prisma.game.findUnique({ where: { id: parent.gameId } });
      return game ? serializeDates(game) : null;
    },

    comments: async (parent: Review) => {
      const comments = await prisma.comment.findMany({
        where: { reviewId: parent.id },
        orderBy: { createdAt: "asc" },
      });
      return comments.map(serializeDates);
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
