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

interface BuildContextArgs {
  req: Request;
  /**
   * Whether identity headers may be honoured on this route.
   *
   * False on the public endpoint, which no authentik outpost guards. Ignoring
   * the headers there means a client cannot authenticate by simply sending
   * them to the unprotected path.
   */
  trustIdentity: boolean;
}

/**
 * Derives the request context from the identity headers set by the authentik
 * proxy outpost. There is no password or token handling in this application —
 * authentik owns the login flow, including 2FA.
 */
export async function buildContext({
  req,
  trustIdentity,
}: BuildContextArgs): Promise<Context> {
  if (!trustIdentity) return { user: null };

  const identity = readIdentity(req);
  if (!identity) return { user: null };

  const user = await provisionUser(identity);
  return { user: { id: user.id, username: user.username, email: user.email } };
}

/** Throws UNAUTHENTICATED if the request carried no verified identity. */
export function requireAuth(context: Context): AuthUser {
  if (!context.user) {
    throw new GraphQLError(
      "You must be logged in. Write operations must be sent to the authenticated endpoint.",
      { extensions: { code: "UNAUTHENTICATED" } }
    );
  }
  return context.user;
}
