import { GraphQLError } from "graphql";
import type { Request } from "express";
import { provisionUser, readIdentity } from "./lib/identity";

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
}

export interface Context {
  user: AuthUser | null;
}

/**
 * Derives the request context from the identity headers set by the authentik
 * proxy outpost. There is no password or token handling in this application —
 * authentik owns the login flow, including 2FA.
 */
export async function buildContext({ req }: { req: Request }): Promise<Context> {
  const identity = readIdentity(req);
  if (!identity) return { user: null };

  const user = await provisionUser(identity);
  return { user: { id: user.id, username: user.username, email: user.email } };
}

/** Throws UNAUTHENTICATED if the request carried no verified identity. */
export function requireAuth(context: Context): AuthUser {
  if (!context.user) {
    throw new GraphQLError("You must be logged in.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return context.user;
}
