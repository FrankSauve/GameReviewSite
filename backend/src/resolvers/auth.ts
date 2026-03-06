import bcrypt from "bcryptjs";
import { GraphQLError } from "graphql";
import { prisma } from "../lib/prisma";
import { signToken } from "../context";
import { serializeDates } from "../lib/serialize";

interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

const SALT_ROUNDS = 12;

function validatePassword(password: string): void {
  if (password.length < 8)
    throw new GraphQLError("Password must be at least 8 characters.");
}

function validateEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    throw new GraphQLError("Invalid email address.");
  return trimmed;
}

function validateUsername(username: string): string {
  const trimmed = username.trim();
  if (!trimmed || trimmed.length < 2)
    throw new GraphQLError("Username must be at least 2 characters.");
  if (trimmed.length > 50)
    throw new GraphQLError("Username must be at most 50 characters.");
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed))
    throw new GraphQLError(
      "Username may only contain letters, numbers, underscores, and hyphens."
    );
  return trimmed;
}

export const authResolvers = {
  Mutation: {
    register: async (_parent: unknown, { input }: { input: RegisterInput }) => {
      const username = validateUsername(input.username);
      const email = validateEmail(input.email);
      validatePassword(input.password);

      const existing = await prisma.user.findFirst({
        where: { OR: [{ email }, { username }] },
      });
      if (existing?.email === email)
        throw new GraphQLError("An account with that email already exists.");
      if (existing?.username === username)
        throw new GraphQLError("That username is already taken.");

      const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
      const user = await prisma.user.create({
        data: { username, email, password: hashedPassword },
      });

      const serialized = serializeDates(user);
      return { token: signToken(serialized), user: serialized };
    },

    login: async (_parent: unknown, { input }: { input: LoginInput }) => {
      const email = validateEmail(input.email);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user)
        throw new GraphQLError("Invalid email or password.", {
          extensions: { code: "UNAUTHENTICATED" },
        });

      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid)
        throw new GraphQLError("Invalid email or password.", {
          extensions: { code: "UNAUTHENTICATED" },
        });

      const serialized = serializeDates(user);
      return { token: signToken(serialized), user: serialized };
    },
  },
};
