import { Prisma } from "../generated/prisma/client.js";

/**
 * Deletes those of `gameIds` left with no review. The rows are locked before the
 * check, so a review inserted concurrently is either seen by it or fails its key.
 */
export async function pruneUnreviewedGames(
  tx: Prisma.TransactionClient,
  gameIds: string[],
): Promise<number> {
  if (gameIds.length === 0) return 0;
  await tx.$queryRaw`SELECT id FROM "Game" WHERE id IN (${Prisma.join(gameIds)}) ORDER BY id FOR UPDATE`;
  const { count } = await tx.game.deleteMany({
    where: { id: { in: gameIds }, reviews: { none: {} } },
  });
  return count;
}
