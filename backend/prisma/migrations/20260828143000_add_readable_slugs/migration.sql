-- Readable URL slugs for users, games and reviews.
--
-- Each column is added nullable, backfilled, and only then made NOT NULL:
-- `ADD COLUMN ... NOT NULL` with no default would refuse to run against the rows
-- already there. The unique index is created up front — a nullable unique column
-- accepts many NULLs — so the backfill's "is this taken?" test uses it, and so a
-- mistake here fails on the offending row rather than at the end.
--
-- `pg_temp.slugify` reproduces src/lib/slug.ts rather than booting the app for a
-- one-off pass, down to the diacritic folding that `lower()` alone does not do.
-- The map covers Latin-1 and the digraphs; a title in a script it does not reach
-- still folds to the fallback, as it does in TypeScript.
--
-- Suffixing is `uniqueSlug`'s algorithm, not an approximation: the first free
-- `-2`, `-3`… checked against every slug assigned so far, because two games
-- called "Portal" and one called "Portal 2" all want `portal-2`.

CREATE FUNCTION pg_temp.slugify(input TEXT, fallback TEXT) RETURNS TEXT AS $$
  SELECT COALESCE(
    NULLIF(
      rtrim(
        left(
          ltrim(
            regexp_replace(
              translate(
                replace(replace(replace(replace(lower(input),
                  'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'ø', 'o'),
                'áàâäãåçéèêëìíîïñòóôöõùúûüýÿšžđþ',
                'aaaaaaceeeeiiiinooooouuuuyyszdp'
              ),
              '[^a-z0-9]+', '-', 'g'
            ),
            '-'
          ),
          60
        ),
        '-'
      ),
      ''
    ),
    fallback
  );
$$ LANGUAGE SQL IMMUTABLE;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_slug_key" ON "User"("slug");

DO $$
DECLARE rec RECORD; candidate TEXT; n INT;
BEGIN
  FOR rec IN
    SELECT "id", pg_temp.slugify("username", 'user') AS base FROM "User" ORDER BY "id"
  LOOP
    candidate := rec.base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "User" WHERE "slug" = candidate) LOOP
      n := n + 1;
      candidate := rec.base || '-' || n;
    END LOOP;
    UPDATE "User" SET "slug" = candidate WHERE "id" = rec."id";
  END LOOP;
END $$;

ALTER TABLE "User" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

DO $$
DECLARE rec RECORD; candidate TEXT; n INT;
BEGIN
  FOR rec IN
    SELECT "id", pg_temp.slugify("title", 'game') AS base FROM "Game" ORDER BY "id"
  LOOP
    candidate := rec.base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "Game" WHERE "slug" = candidate) LOOP
      n := n + 1;
      candidate := rec.base || '-' || n;
    END LOOP;
    UPDATE "Game" SET "slug" = candidate WHERE "id" = rec."id";
  END LOOP;
END $$;

ALTER TABLE "Game" ALTER COLUMN "slug" SET NOT NULL;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Review_slug_key" ON "Review"("slug");

-- `<game-slug>-by-<user-slug>`, so it runs after both backfills above.
DO $$
DECLARE rec RECORD; candidate TEXT; n INT;
BEGIN
  FOR rec IN
    SELECT r."id", g."slug" || '-by-' || u."slug" AS base
    FROM "Review" r
    JOIN "Game" g ON g."id" = r."gameId"
    JOIN "User" u ON u."id" = r."userId"
    ORDER BY r."id"
  LOOP
    candidate := rec.base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "Review" WHERE "slug" = candidate) LOOP
      n := n + 1;
      candidate := rec.base || '-' || n;
    END LOOP;
    UPDATE "Review" SET "slug" = candidate WHERE "id" = rec."id";
  END LOOP;
END $$;

ALTER TABLE "Review" ALTER COLUMN "slug" SET NOT NULL;
