import "dotenv/config";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloArmor } from "@escape.tech/graphql-armor";
import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";

import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./resolvers";
import { buildContext } from "./context";
import { prisma } from "./lib/prisma";
import {
  allowedOrigins,
  generalLimiter,
  isProduction,
  rawgLimiter,
  trustProxyHops,
} from "./security";

const PORT = parseInt(process.env["PORT"] ?? "4000", 10);

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
const PUBLIC_PATH = "/graphql";
const AUTHENTICATED_PATH = "/graphql-auth";

// The schema is cyclic (Review → user → reviews → comments → review → …), so
// an unbounded query can recurse until the process falls over. The deepest
// query the frontend actually sends is 5 levels.
const armor = new ApolloArmor({
  maxDepth: { n: 8 },
  maxAliases: { n: 15 },
  maxDirectives: { n: 20 },
  maxTokens: { n: 1000 },
  blockFieldSuggestion: { enabled: isProduction },
  costLimit: { maxCost: 5000 },
});

async function bootstrap(): Promise<void> {
  const app = express();

  // Required for rate limiting to see real client IPs behind the reverse proxy.
  app.set("trust proxy", trustProxyHops());

  const protection = armor.protect();

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: !isProduction,
    plugins: [...protection.plugins],
    validationRules: [...protection.validationRules],
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
  app.use(helmet({ contentSecurityPolicy: isProduction }));

  const middleware = (trustIdentity: boolean) => [
    cors({ origin: allowedOrigins() }),
    express.json({ limit: "100kb" }),
    generalLimiter,
    rawgLimiter,
    expressMiddleware(server, {
      context: async ({ req }) => buildContext({ req, trustIdentity }),
    }),
  ];

  app.use(PUBLIC_PATH, ...middleware(false));
  app.use(AUTHENTICATED_PATH, ...middleware(true));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.listen(PORT, () => {
    console.log(`🎮  Game Review API ready on port ${PORT}`);
    console.log(`    public    ${PUBLIC_PATH}`);
    console.log(`    authed    ${AUTHENTICATED_PATH}`);
  });

  const shutdown = async () => {
    await server.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
