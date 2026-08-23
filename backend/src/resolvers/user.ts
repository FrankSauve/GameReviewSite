import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { serializeDates } from "../lib/serialize";
import { requireAuth, type Context } from "../context";

export const userResolvers = {
  Query: {
    me: async (_parent: unknown, _args: unknown, context: Context) => {
      if (!context.user) return null;
      const user = await prisma.user.findUnique({ where: { id: context.user.id } });
      return user ? serializeDates(user) : null;
    },

    users: async () => {
      const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
      return users.map(serializeDates);
    },

    user: async (_parent: unknown, { id }: { id: string }) => {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? serializeDates(user) : null;
    },
  },

  Mutation: {
    // No updateUser: authentik owns username and email, and any local edit
    // would be overwritten the next time the user makes a request.
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

    reviews: async (parent: User) => {
      const reviews = await prisma.review.findMany({
        where: { userId: parent.id },
        orderBy: { createdAt: "desc" },
      });
      return reviews.map(serializeDates);
    },
  },
};
