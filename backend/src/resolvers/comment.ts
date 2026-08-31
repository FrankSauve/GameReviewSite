import { GraphQLError } from "graphql";
import type { Comment } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeDates } from "../lib/serialize.js";
import { LIST_BOUNDS, clampWindow, type PageArgs } from "../lib/pagination.js";
import { validateString } from "../lib/validate.js";
import { requireAuth, type Context } from "../context.js";

interface CreateCommentInput {
  reviewId: string;
  content: string;
}

interface UpdateCommentInput {
  content: string;
}

const COMMENT_CONTENT_MAX = 2000;

export const commentResolvers = {
  Query: {
    comments: async (
      _parent: unknown,
      { reviewId, ...args }: { reviewId: string } & PageArgs,
      { budget }: Context,
    ) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.nested);
      const comments = await prisma.comment.findMany({
        where: { reviewId },
        orderBy: { createdAt: "asc" },
        take,
        skip,
      });
      return budget.charge(comments).map(serializeDates);
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
      context: Context,
    ) => {
      const authUser = requireAuth(context);

      const review = await prisma.review.findUnique({
        where: { id: input.reviewId },
      });
      if (!review)
        throw new GraphQLError("Review not found.", {
          extensions: { code: "NOT_FOUND" },
        });

      const comment = await prisma.comment.create({
        data: {
          userId: authUser.id,
          reviewId: input.reviewId,
          content: validateString(
            input.content,
            "content",
            COMMENT_CONTENT_MAX,
          ),
        },
      });
      return serializeDates(comment);
    },

    updateComment: async (
      _parent: unknown,
      { id, input }: { id: string; input: UpdateCommentInput },
      context: Context,
    ) => {
      const authUser = requireAuth(context);
      await requireOwnership(id, authUser.id);
      const comment = await prisma.comment.update({
        where: { id },
        data: {
          content: validateString(
            input.content,
            "content",
            COMMENT_CONTENT_MAX,
          ),
        },
      });
      return serializeDates(comment);
    },

    deleteComment: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context,
    ) => {
      const authUser = requireAuth(context);
      await requireOwnership(id, authUser.id);
      await prisma.comment.delete({ where: { id } });
      return true;
    },
  },

  Comment: {
    user: async (parent: Comment, _args: unknown, { loaders }: Context) => {
      const user = await loaders.userById.load(parent.userId);
      return user ? serializeDates(user) : null;
    },

    review: async (parent: Comment) => {
      const review = await prisma.review.findUnique({
        where: { id: parent.reviewId },
      });
      return review ? serializeDates(review) : null;
    },

    reactions: async (
      parent: Comment,
      _args: unknown,
      { loaders, budget }: Context,
    ) => budget.charge(await loaders.reactionsByCommentId.load(parent.id)),
  },
};

async function requireOwnership(
  commentId: string,
  userId: string,
): Promise<Comment> {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment)
    throw new GraphQLError("Comment not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  if (comment.userId !== userId)
    throw new GraphQLError("You can only modify your own comments.", {
      extensions: { code: "FORBIDDEN" },
    });
  return comment;
}
