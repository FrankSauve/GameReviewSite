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
import { createEmbedRouter } from "./routes/embed.js";
import { createExportRouter } from "./routes/export.js";
import {
  allowedOrigins,
  createLimiters,
  isProduction,
  sameOriginOnly,
  trustProxyHops,
} from "./security.js";

/**
 * One endpoint, and authorization decided per field.
 *
 * This used to be two: nginx's `auth_request` cannot read a GraphQL body, so it
 * could not tell a mutation from a query, and the only way to gate writes at the
 * proxy was to serve the schema twice — once guarded, once not. Now that this
 * app is the OAuth2 client and reads its own session cookie, `requireAuth` makes
 * that decision where the resolvers are, and the split has no reason to exist.
 */
export const GRAPHQL_PATH = "/graphql";

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
    // graphql-armor ships no `exports` map, so its type declarations resolve
    // @apollo/server through the `require` condition while this package, now
    // ESM, resolves the `import` one. The two describe the same runtime class,
    // but HeaderMap carries a private field, so TypeScript treats them as
    // unrelated types. The cast is safe rather than convenient: armor declares
    // @apollo/server as an optional peer and has zero runtime references to it,
    // and there is a single hoisted copy, so no second instance exists to be
    // confused with. Remove this once armor publishes dual-condition types.
    plugins: [
      ...(protection.plugins as unknown as ApolloServerPlugin[]),
      collapseDuplicateErrors(),
    ],
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

  // Also outside GraphQL, and for the opposite reason to /auth: the schema's
  // list bounds and text budget are there to stop a single request returning a
  // whole table, which is precisely what an export is. See routes/export.ts.
  app.use("/export", limiters.exports, createExportRouter());

  // Shares a path with the SPA: the proxy sends crawler user agents here and
  // everyone else to the frontend container. See routes/embed.ts.
  app.use("/reviews", limiters.embeds, createEmbedRouter());

  app.use(
    GRAPHQL_PATH,
    cors({ origin: allowedOrigins() }),
    sameOriginOnly(),
    express.json({ limit: "100kb" }),
    limiters.general,
    limiters.rawg,
    expressMiddleware(server, {
      context: async ({ req }) => buildContext({ req }),
    })
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  return { app, stop: () => server.stop() };
}
