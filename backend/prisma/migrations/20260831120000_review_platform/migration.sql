-- One platform per review, replacing the platform tags on the game.
--
-- Do not regenerate: the generated version drops "Game"."platforms" in the same
-- statement that the backfill below reads it from, losing every value.

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "platform" TEXT;

-- The offerable platforms, spelled as PLATFORMS in src/lib/platforms.ts spells
-- them. Change both, or a backfilled row holds a value the dropdown cannot
-- offer and the next edit silently rewrites it.
WITH offered(name) AS (
  VALUES
    ('PC'), ('macOS'), ('Linux'),
    ('PlayStation 5'), ('PlayStation 4'), ('PlayStation 3'),
    ('PlayStation 2'), ('PlayStation'), ('PS Vita'), ('PSP'),
    ('Xbox Series S/X'), ('Xbox One'), ('Xbox 360'), ('Xbox'),
    ('Nintendo Switch'), ('Wii U'), ('Wii'),
    ('Nintendo 3DS'), ('Nintendo DS'), ('GameCube'), ('Nintendo 64'),
    ('SNES'), ('NES'), ('Game Boy Advance'),
    ('iOS'), ('Android'), ('Web')
),
-- The game's first offerable tag, in the list's spelling. Not simply the first
-- tag: one that is off the list is skipped rather than stored, and the match is
-- case-insensitive because RAWG writes both "macOS" and "MacOS".
matched AS (
  SELECT g.id AS game_id, tags.ordinality, o.name AS platform
  FROM "Game" g
  CROSS JOIN LATERAL unnest(g.platforms) WITH ORDINALITY AS tags(tag, ordinality)
  JOIN offered o ON lower(o.name) = lower(btrim(tags.tag))
),
picked AS (
  SELECT DISTINCT ON (game_id) game_id, platform
  FROM matched
  ORDER BY game_id, ordinality
)
UPDATE "Review" r
SET "platform" = picked.platform
FROM picked
WHERE r."gameId" = picked.game_id;

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "platforms";
