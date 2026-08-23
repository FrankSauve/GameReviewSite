import { GraphQLError } from "graphql";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { serializeDates } from "../lib/serialize";
import { requireAuth, type Context } from "../context";

interface UpdateUserInput {
  username?: string;
  email?: string;
}

function validateString(value: string, field: string, maxLength = 500): string {
  const trimmed = value.trim();
  if (!trimmed) throw new GraphQLError(`${field} must not be empty.`);
  if (trimmed.length > maxLength)
    throw new GraphQLError(`${field} must be at most ${maxLength} characters.`);
  return trimmed;
}

function validateEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    throw new GraphQLError("Invalid email address.");
  return trimmed;
}

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
    updateUser: async (
      _parent: unknown,
      { input }: { input: UpdateUserInput },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      const data: Partial<Pick<User, "username" | "email">> = {};
      if (input.username !== undefined)
        data.username = validateString(input.username, "username", 50);
      if (input.email !== undefined) data.email = validateEmail(input.email);
      const user = await prisma.user.update({ where: { id: authUser.id }, data });
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

    reviews: async (parent: User) => {
      const reviews = await prisma.review.findMany({
        where: { userId: parent.id },
        orderBy: { createdAt: "desc" },
      });
      return reviews.map(serializeDates);
    },
  },
};
