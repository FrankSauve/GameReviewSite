-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "steamAppId" TEXT,
ADD COLUMN     "tgdbId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Game_steamAppId_key" ON "Game"("steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_tgdbId_key" ON "Game"("tgdbId");
