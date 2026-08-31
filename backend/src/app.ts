import { ApolloServer, type ApolloServerPlugin } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloArmor } from "@escape.tech/graphql-armor";
import express, { type Express, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

import { typeDefs } from "./schema/typeDefs.js";
import { resolvers } from "./resolvers/index.js";
import { buildContext } from "./context.js";
import { assertOidcConfig } from "./lib/oidc.js";
import { createMaxRowsRule } from "./lib/maxRows.js";
import { collapseDuplicateErrors } from "./lib/collapseErrors.js";
import { sanitizeError } from "./lib/sanitizeError.js";
import { createAuthRouter } from "./routes/auth.js";
import { createEmbedRouter, createProfileEmbedRouter } from "./routes/embed.js";
import { createExportRouter } from "./routes/export.js";
import {
  allowedOrigins,
  createLimiters,
  isProduction,
  sameOriginOnly,
  trustProxyHops,
} from "./security.js";

/** One endpoint; `requireAuth` decides authorization per field. */
export const GRAPHQL_PATH = "/graphql";

export interface AppHandle {
  app: Express;
  /** Shuts down Apollo. Does not touch the Prisma connection. */
  stop: () => Promise<void>;
}

function buildArmor(): ApolloArmor {
  // The schema is cyclic (Review → user → reviews → comments → review → …).
  // Depth 6 because the deepest query the frontend sends is 5, and each extra
  // level multiplies the rows one request can reach. Shape only; result size is
  // bounded in lib/pagination.ts.
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
  // Before anything is served: refuse to run in a configuration where nobody
  // could sign in.
  assertOidcConfig();

  const app = express();

  // Required for rate limiting to see real client IPs behind the reverse proxy.
  app.set("trust proxy", trustProxyHops());

  const protection = buildArmor().protect();

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: !isProduction(),
    // On by default in Apollo Server 4+, but stated explicitly because it is now
    // load-bearing: a cookie-borne session means a cross-site form POST would
    // carry credentials, and this is what rejects it. See sameOriginOnly.
    csrfPrevention: true,
    // graphql-armor ships no `exports` map, so its types resolve @apollo/server
    // through `require` while this package resolves `import` — same runtime
    // class, unrelated to TypeScript. Safe because armor has zero runtime
    // references to it. Remove once armor publishes dual-condition types.
    plugins: [
      ...(protection.plugins as unknown as ApolloServerPlugin[]),
      collapseDuplicateErrors(),
    ],
    validationRules: [...protection.validationRules, createMaxRowsRule()],
    formatError: (formattedError, originalError) => {
      const sanitized = sanitizeError(formattedError);
      if (sanitized.message !== formattedError.message) {
        console.error(
          "GraphQL internal error:",
          originalError ?? formattedError,
        );
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

  // Also outside GraphQL, and for the opposite reason to /auth: the schema's
  // list bounds and text budget are there to stop a single request returning a
  // whole table, which is precisely what an export is. See routes/export.ts.
  app.use("/export", limiters.exports, createExportRouter());

  // Shares a path with the SPA: the proxy sends crawler user agents here and
  // everyone else to the frontend container. See routes/embed.ts.
  app.use("/reviews", limiters.embeds, createEmbedRouter());
  app.use("/users", limiters.embeds, createProfileEmbedRouter());

  app.use(
    GRAPHQL_PATH,
    cors({ origin: allowedOrigins() }),
    sameOriginOnly(),
    express.json({ limit: "100kb" }),
    limiters.general,
    limiters.rawg,
    expressMiddleware(server, {
      context: async ({ req }) => buildContext({ req }),
    }),
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  return { app, stop: () => server.stop() };
}
