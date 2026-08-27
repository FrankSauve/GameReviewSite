-- CreateEnum
CREATE TYPE "ReviewGrouping" AS ENUM ('YEAR', 'SCORE', 'RECENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultReviewGrouping" "ReviewGrouping" NOT NULL DEFAULT 'YEAR';
