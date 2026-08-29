-- Readable URL slugs for games and reviews.
--
-- Each column is added nullable, backfilled, and only then made NOT NULL: the
-- tables already have rows, and `ADD COLUMN ... NOT NULL` with no default would
-- refuse to run against them.
--
-- The backfill reproduces `slugify` from src/lib/slug.ts in SQL rather than
-- calling it — a one-off pass over existing rows is not worth a migration that
-- has to boot the application. It mirrors that function step for step: collapse
-- everything that is not a lowercase letter or digit into a dash, trim leading
-- dashes, cut to 60 characters, then trim the trailing dash the cut may have
-- left. The single difference is diacritics: `slugify` decomposes "Pokémon" into
-- "pokemon", while `lower()` here leaves the accented letter for the character
-- class to turn into a dash. That applies only to rows written before this
-- migration, and only to how the slug reads.
--
-- Duplicate slugs are disambiguated the same way `uniqueSlug` does, by appending
-- `-2`, `-3`… in a stable order, so the unique index at the end cannot fail on
-- two games that share a title.

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "slug" TEXT;

-- Backfill Game.slug from the title.
WITH base AS (
    SELECT
        "id",
        COALESCE(
            NULLIF(
                rtrim(
                    left(
                        ltrim(regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g'), '-'),
                        60
                    ),
                    '-'
                ),
                ''
            ),
            'game'
        ) AS "slug"
    FROM "Game"
),
numbered AS (
    SELECT
        "id",
        "slug",
        row_number() OVER (PARTITION BY "slug" ORDER BY "id") AS "n"
    FROM base
)
UPDATE "Game" g
SET "slug" = CASE WHEN n."n" = 1 THEN n."slug" ELSE n."slug" || '-' || n."n" END
FROM numbered n
WHERE g."id" = n."id";

ALTER TABLE "Game" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "slug" TEXT;

-- Backfill Review.slug as `<game-slug>-by-<username>`. Runs after the Game
-- backfill above, which is what populates the game slug it reads.
WITH base AS (
    SELECT
        r."id",
        g."slug" || '-by-' || COALESCE(
            NULLIF(
                rtrim(
                    left(
                        ltrim(regexp_replace(lower(u."username"), '[^a-z0-9]+', '-', 'g'), '-'),
                        60
                    ),
                    '-'
                ),
                ''
            ),
            'user'
        ) AS "slug"
    FROM "Review" r
    JOIN "Game" g ON g."id" = r."gameId"
    JOIN "User" u ON u."id" = r."userId"
),
numbered AS (
    SELECT
        "id",
        "slug",
        row_number() OVER (PARTITION BY "slug" ORDER BY "id") AS "n"
    FROM base
)
UPDATE "Review" r
SET "slug" = CASE WHEN n."n" = 1 THEN n."slug" ELSE n."slug" || '-' || n."n" END
FROM numbered n
WHERE r."id" = n."id";

ALTER TABLE "Review" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Review_slug_key" ON "Review"("slug");
