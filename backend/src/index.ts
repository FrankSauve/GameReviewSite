import "dotenv/config";

import { GRAPHQL_PATH, createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const PORT = parseInt(process.env["PORT"] ?? "4000", 10);

async function bootstrap(): Promise<void> {
  const { app, stop } = await createApp();

  const httpServer = app.listen(PORT, () => {
    console.log(`🎮  Game Review API ready on port ${PORT}`);
    console.log(`    graphql   ${GRAPHQL_PATH}`);
    console.log(`    sign in   /auth/login`);
  });

  const shutdown = async () => {
    httpServer.close();
    await stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

bootstrap().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
