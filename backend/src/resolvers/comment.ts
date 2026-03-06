import { GraphQLError } from "graphql";
import type { Comment } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { serializeDates } from "../lib/serialize";
import { requireAuth, type Context } from "../context";

interface CreateCommentInput {
  reviewId: string;
  content: string;
}

interface UpdateCommentInput {
  content: string;
}

function validateString(value: string, field: string, maxLength = 2000): string {
  const trimmed = value.trim();
  if (!trimmed) throw new GraphQLError(`${field} must not be empty.`);
  if (trimmed.length > maxLength)
    throw new GraphQLError(`${field} must be at most ${maxLength} characters.`);
  return trimmed;
}

export const commentResolvers = {
  Query: {
    comments: async (_parent: unknown, { reviewId }: { reviewId: string }) => {
      const comments = await prisma.comment.findMany({
        where: { reviewId },
        orderBy: { createdAt: "asc" },
      });
      return comments.map(serializeDates);
    },

    comment: async (_parent: unknown, { id }: { id: string }) => {
      const comment = await prisma.comment.findUnique({ where: { id } });
      return comment ? serializeDates(comment) : null;
    },
  },

  Mutation: {
    createComment: async (
      _parent: unknown,
      { input }: { input: CreateCommentInput },
      context: Context
    ) => {
      const authUser = requireAuth(context);

      const review = await prisma.review.findUnique({ where: { id: input.reviewId } });
      if (!review)
        throw new GraphQLError("Review not found.", { extensions: { code: "NOT_FOUND" } });

      const comment = await prisma.comment.create({
        data: {
          userId: authUser.id,
          reviewId: input.reviewId,
          content: validateString(input.content, "content"),
        },
      });
      return serializeDates(comment);
    },

    updateComment: async (
      _parent: unknown,
      { id, input }: { id: string; input: UpdateCommentInput },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      await requireOwnership(id, authUser.id);
      const comment = await prisma.comment.update({
        where: { id },
        data: { content: validateString(input.content, "content") },
      });
      return serializeDates(comment);
    },

    deleteComment: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      await requireOwnership(id, authUser.id);
      await prisma.comment.delete({ where: { id } });
      return true;
    },
  },

  Comment: {
    user: async (parent: Comment) => {
      const user = await prisma.user.findUnique({ where: { id: parent.userId } });
      return user ? serializeDates(user) : null;
    },

    review: async (parent: Comment) => {
      const review = await prisma.review.findUnique({ where: { id: parent.reviewId } });
      return review ? serializeDates(review) : null;
    },
  },
};

async function requireOwnership(commentId: string, userId: string): Promise<Comment> {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment)
    throw new GraphQLError("Comment not found.", { extensions: { code: "NOT_FOUND" } });
  if (comment.userId !== userId)
    throw new GraphQLError("You can only modify your own comments.", {
      extensions: { code: "FORBIDDEN" },
    });
  return comment;
}
