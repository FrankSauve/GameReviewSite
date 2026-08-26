import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloArmor } from "@escape.tech/graphql-armor";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";

import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./resolvers";
import { buildContext } from "./context";
import { assertIdentityConfig } from "./lib/identity";
import { createMaxRowsRule } from "./lib/maxRows";
import { collapseDuplicateErrors } from "./lib/collapseErrors";
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
    formatError: (formattedError) => {
      const { extensions, ...safe } = formattedError;
      return {
        ...safe,
        extensions: extensions
          ? { code: (extensions["code"] as string) ?? "INTERNAL_SERVER_ERROR" }
          : undefined,
      };
    },
  });

  await server.start();

  // CSP is disabled outside production so the Apollo Sandbox landing page works.
  app.use(helmet({ contentSecurityPolicy: isProduction() }));

  const limiters = createLimiters();

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
