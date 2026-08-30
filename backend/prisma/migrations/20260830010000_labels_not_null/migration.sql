-- Game.genres and Game.platforms are declared String[] in schema.prisma, which
-- is non-nullable, but 20260829041559_multi_platform_genre added them nullable
-- with no default. Prisma coerced the NULL to [] on read, so the divergence was
-- invisible from the app and visible to every other reader.
--
-- Backfill before the constraint: rows written before this, or by anything that
-- omitted the column, hold NULL and would refuse SET NOT NULL.

UPDATE "Game" SET genres = '{}' WHERE genres IS NULL;
UPDATE "Game" SET platforms = '{}' WHERE platforms IS NULL;

ALTER TABLE "Game" ALTER COLUMN "genres" SET DEFAULT '{}';
ALTER TABLE "Game" ALTER COLUMN "platforms" SET DEFAULT '{}';

ALTER TABLE "Game" ALTER COLUMN "genres" SET NOT NULL;
ALTER TABLE "Game" ALTER COLUMN "platforms" SET NOT NULL;
