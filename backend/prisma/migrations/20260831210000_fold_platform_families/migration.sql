-- One entry per hardware family in PLATFORMS, so the per-model values the
-- 20260831 backfill stored are no longer offerable. Fold each into its family;
-- anything with no family left becomes null, which is "not recorded".
--
-- Schema-only migrations do not produce this; it is data, written by hand.
UPDATE "Review"
SET "platform" = CASE "platform"
  WHEN 'PlayStation 5' THEN 'PlayStation'
  WHEN 'PlayStation 4' THEN 'PlayStation'
  WHEN 'PlayStation 3' THEN 'PlayStation'
  WHEN 'PlayStation 2' THEN 'PlayStation'
  WHEN 'PS Vita' THEN 'PlayStation'
  WHEN 'PSP' THEN 'PlayStation'
  WHEN 'Xbox Series S/X' THEN 'Xbox'
  WHEN 'Xbox One' THEN 'Xbox'
  WHEN 'Xbox 360' THEN 'Xbox'
  WHEN 'Nintendo Switch' THEN 'Switch'
  WHEN 'Wii U' THEN 'Wii'
  WHEN 'Nintendo 3DS' THEN 'Nintendo DS'
  WHEN 'macOS' THEN 'PC'
  WHEN 'Linux' THEN 'PC'
  ELSE NULL
END
WHERE "platform" IS NOT NULL
  AND "platform" NOT IN (
    'PC', 'PlayStation', 'Xbox', 'Switch', 'Wii',
    'Nintendo DS', 'GameCube', 'iOS', 'Android', 'Web'
  );
