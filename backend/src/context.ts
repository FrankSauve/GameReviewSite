import { GraphQLError } from "graphql";
import type { Request } from "express";
import { devIdentity, provisionUser } from "./lib/identity.js";
import { readSession } from "./lib/session.js";
import { createLoaders, type Loaders } from "./lib/loaders.js";
import { RowBudget } from "./lib/budget.js";

export interface AuthUser {
  id: string;
  slug: string;
  username: string;
  email: string | null;
}

export interface Context {
  user: AuthUser | null;
  /** Per-request relation batching. See lib/loaders.ts. */
  loaders: Loaders;
  /** Per-request ceiling on total list rows returned. See lib/budget.ts. */
  budget: RowBudget;
}

interface BuildContextArgs {
  req: Request;
}

/**
 * Derives the request context from the session cookie.
 *
 * There is no password handling here and no token in the browser: authentik
 * authenticates people over OIDC, including 2FA, and lib/session.ts turns the
 * result into a session of this app's own. A request with no session, an
 * unknown one, or an expired one is anonymous — which is an ordinary state,
 * because reviews are public.
 */
export async function buildContext({
  req,
}: BuildContextArgs): Promise<Context> {
  const loaders = createLoaders();
  const budget = new RowBudget();

  // Local development only, and never in production. See devIdentity.
  const dev = devIdentity();
  if (dev) {
    const user = await provisionUser(dev);
    return {
      user: {
        id: user.id,
        slug: user.slug,
        username: user.username,
        email: user.email,
      },
      loaders,
      budget,
    };
  }

  const session = await readSession(req);
  if (!session) return { user: null, loaders, budget };

  return {
    user: {
      id: session.user.id,
      slug: session.user.slug,
      username: session.user.username,
      email: session.user.email,
    },
    loaders,
    budget,
  };
}

/** Throws UNAUTHENTICATED if the request carried no valid session. */
export function requireAuth(context: Context): AuthUser {
  if (!context.user) {
    throw new GraphQLError("You must be signed in to do that.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return context.user;
}
