import { GraphQLError } from "graphql";
import jwt from "jsonwebtoken";
import type { Request } from "express";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface Context {
  user: AuthUser | null;
}

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) throw new Error("JWT_SECRET env variable is not set.");

// Narrowed to string after the check above
const SECRET: string = JWT_SECRET;

export function buildContext({ req }: { req: Request }): Context {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return { user: null };

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, SECRET) as unknown as AuthUser;
    return { user: { id: payload.id, username: payload.username, email: payload.email } };
  } catch {
    return { user: null };
  }
}

/** Throws UNAUTHENTICATED if no valid JWT was supplied. */
export function requireAuth(context: Context): AuthUser {
  if (!context.user) {
    throw new GraphQLError("You must be logged in.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return context.user;
}

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    SECRET,
    { expiresIn: SEVEN_DAYS_SECONDS }
  );
}
