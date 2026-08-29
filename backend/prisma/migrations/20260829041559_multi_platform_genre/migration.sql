-- Genres and platforms become lists.
--
-- Do not regenerate: the generated version drops the old columns in the same
-- statement that adds the new ones, losing every recorded value.
--
-- The backfill mirrors validateLabels in resolvers/game.ts. Change both.

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "genres" TEXT[],
ADD COLUMN     "platforms" TEXT[];

-- Backfill from the single-valued columns.
UPDATE "Game" SET
  "genres" = COALESCE(
    (
      SELECT array_agg(value ORDER BY ordinality)
      FROM (
        SELECT value, ordinality
        FROM (
          SELECT DISTINCT ON (lower(btrim(part)))
                 btrim(part) AS value, ordinality
          FROM unnest(string_to_array(COALESCE("genre", ''), ',')) WITH ORDINALITY AS t(part, ordinality)
          WHERE btrim(part) <> ''
          ORDER BY lower(btrim(part)), ordinality
        ) AS deduped
        ORDER BY ordinality
        LIMIT 5
      ) AS kept
    ),
    ARRAY[]::TEXT[]
  ),
  "platforms" = COALESCE(
    (
      SELECT array_agg(value ORDER BY ordinality)
      FROM (
        SELECT value, ordinality
        FROM (
          SELECT DISTINCT ON (lower(btrim(part)))
                 btrim(part) AS value, ordinality
          FROM unnest(string_to_array(COALESCE("platform", ''), ',')) WITH ORDINALITY AS t(part, ordinality)
          WHERE btrim(part) <> ''
          ORDER BY lower(btrim(part)), ordinality
        ) AS deduped
        ORDER BY ordinality
        LIMIT 5
      ) AS kept
    ),
    ARRAY[]::TEXT[]
  );

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "genre",
DROP COLUMN "platform";
