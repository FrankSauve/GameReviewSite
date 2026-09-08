import { GraphQLError } from "graphql";
import { prisma } from "../lib/prisma.js";
import { badInput } from "../lib/badInput.js";
import { validateEmoji } from "../lib/emoji.js";
import { REACTOR_NAMES_MAX } from "../lib/pagination.js";
import type { ReactionSummary } from "../lib/loaders.js";
import { requireAuth, type Context } from "../context.js";

/** What both the query and the mutation name: one emoji on one parent. */
interface ReactionTarget {
  reviewId?: string | null;
  commentId?: string | null;
  emoji: string;
}

type Parent = { kind: "review" | "comment"; id: string };

/** Exactly one parent, the same rule the table's CHECK enforces. */
function parentOf(input: ReactionTarget): Parent {
  if (input.reviewId && input.commentId)
    throw badInput("Give either reviewId or commentId, not both.");
  if (input.reviewId) return { kind: "review", id: input.reviewId };
  if (input.commentId) return { kind: "comment", id: input.commentId };
  throw badInput("Give either reviewId or commentId.");
}

export const reactionResolvers = {
  Query: {
    reactionUsers: async (
      _parent: unknown,
      args: ReactionTarget,
    ): Promise<string[]> => {
      const emoji = validateEmoji(args.emoji);
      const parent = parentOf(args);
      const rows = await prisma.reaction.findMany({
        where:
          parent.kind === "review"
            ? { emoji, reviewId: parent.id }
            : { emoji, commentId: parent.id },
        // Oldest first, so the names stay put as more people react.
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: REACTOR_NAMES_MAX,
        select: { user: { select: { username: true } } },
      });
      return rows.map((row) => row.user.username);
    },
  },

  Mutation: {
    toggleReaction: async (
      _parent: unknown,
      { input }: { input: ReactionTarget },
      context: Context,
    ): Promise<ReactionSummary[]> => {
      const authUser = requireAuth(context);
      const emoji = validateEmoji(input.emoji);
      const parent = parentOf(input);

      const exists =
        parent.kind === "review"
          ? await prisma.review.count({ where: { id: parent.id } })
          : await prisma.comment.count({ where: { id: parent.id } });
      if (!exists)
        throw new GraphQLError(
          parent.kind === "review" ? "Review not found." : "Comment not found.",
          { extensions: { code: "NOT_FOUND" } },
        );

      const where =
        parent.kind === "review"
          ? { userId: authUser.id, emoji, reviewId: parent.id }
          : { userId: authUser.id, emoji, commentId: parent.id };
      // Delete-then-create rather than read-then-branch: the unique index
      // decides, so two clicks racing cannot leave two rows behind.
      const removed = await prisma.reaction.deleteMany({ where });
      if (removed.count === 0) await prisma.reaction.create({ data: where });

      const loader =
        parent.kind === "review"
          ? context.loaders.reactionsByReviewId
          : context.loaders.reactionsByCommentId;
      // The loader may already hold the pre-toggle summary for this request.
      loader.clear(parent.id);
      return loader.load(parent.id);
    },
  },
};
