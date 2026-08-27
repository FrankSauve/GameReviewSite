import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloArmor } from "@escape.tech/graphql-armor";
import express, { type Express, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./resolvers";
import { buildContext } from "./context";
import { assertIdentityConfig } from "./lib/identity";
import { createMaxRowsRule } from "./lib/maxRows";
import { collapseDuplicateErrors } from "./lib/collapseErrors";
import { sanitizeError } from "./lib/sanitizeError";
import { createAuthRouter } from "./routes/auth";
import {
  allowedOrigins,
  createLimiters,
  isProduction,
  trustProxyHops,
} from "./security";

/**
 * Reviews are public, writes are not, and a single GraphQL endpoint cannot be
 * selectively gated by nginx's auth_request (it cannot read the query body).
 * So the same schema is served twice:
 *
 *   /graphql       reachable by anyone, always anonymous, reads only
 *   /graphql-auth  guarded by the authentik outpost, identity honoured
 *
 * Mutations reaching /graphql fail with UNAUTHENTICATED, which is what tells
 * the client to sign in.
 */
export const PUBLIC_PATH = "/graphql";
export const AUTHENTICATED_PATH = "/graphql-auth";

export interface AppHandle {
  app: Express;
  /** Shuts down Apollo. Does not touch the Prisma connection. */
  stop: () => Promise<void>;
}

function buildArmor(): ApolloArmor {
  // The schema is cyclic (Review → user → reviews → comments → review → …), so
  // an unbounded query can recurse until the process falls over. The deepest
  // query the frontend actually sends is 5 levels.
  //
  // These bound the *shape* of a query. They do not bound the size of the
  // result — cost is scored before a single row is read — which is why every
  // list field is separately clamped in lib/pagination.ts. Depth 6 rather than
  // 8 because nothing legitimate needs 8 and each extra level multiplies the
  // rows a single request can reach.
  return new ApolloArmor({
    maxDepth: { n: 6 },
    maxAliases: { n: 15 },
    maxDirectives: { n: 20 },
    maxTokens: { n: 1000 },
    blockFieldSuggestion: { enabled: isProduction() },
    costLimit: { maxCost: 5000 },
  });
}

export async function createApp(): Promise<AppHandle> {
  // Before anything is served: refuse to run in a configuration where proxy
  // headers would be trusted without proof.
  assertIdentityConfig();

  const app = express();

  // Required for rate limiting to see real client IPs behind the reverse proxy.
  app.set("trust proxy", trustProxyHops());

  const protection = buildArmor().protect();

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: !isProduction(),
    plugins: [...protection.plugins, collapseDuplicateErrors()],
    validationRules: [...protection.validationRules, createMaxRowsRule()],
    formatError: (formattedError, originalError) => {
      const sanitized = sanitizeError(formattedError);
      if (sanitized.message !== formattedError.message) {
        console.error("GraphQL internal error:", originalError ?? formattedError);
      }
      return sanitized;
    },
  });

  await server.start();

  // CSP is disabled outside production so the Apollo Sandbox landing page works.
  app.use(helmet({ contentSecurityPolicy: isProduction() }));

  // Sessions live in a cookie, so the cookie has to be parsed before anything
  // that reads one. Nothing is signed here: the session cookie is an opaque
  // random token looked up in the database, not a bearer of claims.
  app.use(cookieParser());

  const limiters = createLimiters();

  // Mounted before the GraphQL middleware, and deliberately outside it: signing
  // in is not a GraphQL operation, and these routes must stay reachable when
  // nobody is signed in.
  app.use("/auth", limiters.auth, createAuthRouter(isProduction()));

  const middleware = (trustIdentity: boolean) => [
    cors({ origin: allowedOrigins() }),
    express.json({ limit: "100kb" }),
    limiters.general,
    limiters.rawg,
    expressMiddleware(server, {
      context: async ({ req }) => buildContext({ req, trustIdentity }),
    }),
  ];

  app.use(PUBLIC_PATH, ...middleware(false));
  app.use(AUTHENTICATED_PATH, ...middleware(true));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  return { app, stop: () => server.stop() };
}
