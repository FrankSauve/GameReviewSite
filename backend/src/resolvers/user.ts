import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeDates } from "../lib/serialize.js";
import {
  LIST_BOUNDS,
  applyWindow,
  clampWindow,
  type PageArgs,
} from "../lib/pagination.js";
import { GraphQLError } from "graphql";
import { requireAuth, type Context } from "../context.js";
import { byIdOrSlug } from "../lib/slug.js";
import { validateAvatarColor } from "../lib/avatarColor.js";

/** Enforced here; the textarea's maxLength is only a hint to the browser. */
export const BIO_MAX = 3000;

interface UpdateProfileInput {
  bio?: string | null;
  avatarColor?: string | null;
}

export const userResolvers = {
  Query: {
    me: async (_parent: unknown, _args: unknown, context: Context) => {
      if (!context.user) return null;
      const user = await prisma.user.findUnique({
        where: { id: context.user.id },
      });
      return user ? serializeDates(user) : null;
    },

    /**
     * Public, so it is a bounded page rather than the whole account table.
     * Usernames come from authentik, which makes an unbounded version a login-name
     * roster for anyone probing the identity provider.
     */
    users: async (_parent: unknown, args: PageArgs, { budget }: Context) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.users);
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(users).map(serializeDates);
    },

    user: async (_parent: unknown, { id }: { id: string }) => {
      const user = await prisma.user.findFirst({ where: byIdOrSlug(id) });
      return user ? serializeDates(user) : null;
    },
  },

  Mutation: {
    // Edits the fields authentik does not own: the bio and the avatar colour.
    // Still no username or email: authentik is the source for both. No id
    // argument either — you may only ever edit your own profile.
    updateProfile: async (
      _parent: unknown,
      { input }: { input: UpdateProfileInput },
      context: Context,
    ) => {
      const authUser = requireAuth(context);

      const data: { bio?: string | null; avatarColor?: string | null } = {};
      if (input.bio !== undefined) {
        const trimmed = (input.bio ?? "").trim();
        if (trimmed.length > BIO_MAX)
          throw new GraphQLError(`bio must be at most ${BIO_MAX} characters.`, {
            extensions: { code: "BAD_USER_INPUT" },
          });
        // Cleared and never written are the same state.
        data.bio = trimmed || null;
      }
      if (input.avatarColor !== undefined) {
        data.avatarColor = validateAvatarColor(input.avatarColor);
      }

      const user = await prisma.user.update({
        where: { id: authUser.id },
        data,
      });
      return serializeDates(user);
    },

    deleteUser: async (_parent: unknown, _args: unknown, context: Context) => {
      const authUser = requireAuth(context);
      await prisma.user.delete({ where: { id: authUser.id } });
      return true;
    },
  },

  User: {
    /**
     * Email addresses are private. Without this guard the public `users` and
     * `user(id)` queries expose every account's email to anonymous callers.
     */
    email: (parent: User, _args: unknown, context: Context) =>
      context.user?.id === parent.id ? parent.email : null,

    reviews: async (
      parent: User,
      args: PageArgs,
      { loaders, budget }: Context,
    ) => {
      const reviews = await loaders.reviewsByUserId.load(parent.id);
      const page = applyWindow(reviews, clampWindow(args, LIST_BOUNDS.nested));
      return budget.charge(page).map(serializeDates);
    },

    /**
     * Aggregated in the database rather than derived from `reviews`, so the
     * leaderboard does not have to download every review to count them.
     */
    reviewCount: async (parent: User, _args: unknown, { loaders }: Context) =>
      (await loaders.reviewStatsByUserId.load(parent.id)).count,

    averageRating: async (parent: User, _args: unknown, { loaders }: Context) =>
      (await loaders.reviewStatsByUserId.load(parent.id)).average,
  },
};
