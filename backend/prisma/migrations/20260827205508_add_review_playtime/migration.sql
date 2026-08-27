-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "hoursPlayed" DOUBLE PRECISION,
ADD COLUMN     "yearPlayed" INTEGER;

-- CreateIndex
CREATE INDEX "Review_userId_yearPlayed_idx" ON "Review"("userId", "yearPlayed");

-- Backfill yearPlayed for reviews written before the column existed.
--
-- The year a review was written is the best available guess at the year its game
-- was played, and it is right for every review posted so far — the site went live
-- and was reviewed the same year. Without this the by-year profile view would open
-- on an "Unknown" bucket containing the site's entire history.
--
-- hoursPlayed is deliberately not backfilled: nothing in the database implies it,
-- and inventing a number would be worse than showing none.
UPDATE "Review" SET "yearPlayed" = EXTRACT(YEAR FROM "createdAt") WHERE "yearPlayed" IS NULL;
