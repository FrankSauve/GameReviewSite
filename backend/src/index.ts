import "dotenv/config";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import express, { type Request, type Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";

import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./resolvers";
import { buildContext } from "./context";
import { prisma } from "./lib/prisma";

const PORT = parseInt(process.env["PORT"] ?? "4000", 10);

async function bootstrap(): Promise<void> {
  const app = express();

  const server = new ApolloServer({
    typeDefs,
    resolvers,
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

  app.use(
    "/graphql",
    cors(),
    bodyParser.json(),
    expressMiddleware(server, { context: async ({ req }) => buildContext({ req }) })
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.listen(PORT, () => {
    console.log(`🎮  Game Review API ready at http://localhost:${PORT}/graphql`);
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
