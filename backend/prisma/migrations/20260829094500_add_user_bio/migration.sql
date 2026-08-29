-- A self-written introduction on the profile page.
--
-- Nullable with no default and no backfill: an account that has never written a
-- bio and an account that has cleared one are the same thing, and both should
-- read as absent rather than as an empty paragraph.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
