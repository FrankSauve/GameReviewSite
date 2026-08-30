-- Review slugs move from "<game>-by-<user>" to "<user>/<game>", so a review is
-- read at /reviews/alice/elden-ring. Rebuilt from the current game and user
-- slugs rather than parsed out of the old value: a game slug may itself contain
-- "-by-".
--
-- The NOT EXISTS guard keeps a row on its old slug if the new one is already
-- taken. Nothing should collide -- a user reviews a game once -- but that is an
-- application rule, and a failed migration is worse than a stale URL.

UPDATE "Review" r
SET slug = u.slug || '/' || g.slug
FROM "User" u, "Game" g
WHERE r."userId" = u.id
  AND r."gameId" = g.id
  AND r.slug <> u.slug || '/' || g.slug
  AND NOT EXISTS (
    SELECT 1 FROM "Review" x
    WHERE x.slug = u.slug || '/' || g.slug AND x.id <> r.id
  );
