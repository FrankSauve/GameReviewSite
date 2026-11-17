-- CreateTable
CREATE TABLE "AwardRank" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,

    CONSTRAINT "AwardRank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardCategory" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,

    CONSTRAINT "AwardCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AwardRank_gameId_idx" ON "AwardRank"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "AwardRank_userId_year_rank_key" ON "AwardRank"("userId", "year", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "AwardRank_userId_year_gameId_key" ON "AwardRank"("userId", "year", "gameId");

-- CreateIndex
CREATE INDEX "AwardCategory_gameId_idx" ON "AwardCategory"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "AwardCategory_userId_year_position_key" ON "AwardCategory"("userId", "year", "position");

-- AddForeignKey
ALTER TABLE "AwardRank" ADD CONSTRAINT "AwardRank_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardRank" ADD CONSTRAINT "AwardRank_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardCategory" ADD CONSTRAINT "AwardCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardCategory" ADD CONSTRAINT "AwardCategory_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

