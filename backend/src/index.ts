import "dotenv/config";

import { AUTHENTICATED_PATH, PUBLIC_PATH, createApp } from "./app";
import { prisma } from "./lib/prisma";

const PORT = parseInt(process.env["PORT"] ?? "4000", 10);

async function bootstrap(): Promise<void> {
  const { app, stop } = await createApp();

  const httpServer = app.listen(PORT, () => {
    console.log(`🎮  Game Review API ready on port ${PORT}`);
    console.log(`    public    ${PUBLIC_PATH}`);
    console.log(`    authed    ${AUTHENTICATED_PATH}`);
  });

  const shutdown = async () => {
    httpServer.close();
    await stop();
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
