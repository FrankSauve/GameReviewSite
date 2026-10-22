-- A game exists only while it has a review. These were imported and never reviewed.
DELETE FROM "Game" g
WHERE NOT EXISTS (SELECT 1 FROM "Review" r WHERE r."gameId" = g.id);
