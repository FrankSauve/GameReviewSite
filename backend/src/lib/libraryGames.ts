import { prisma } from "./prisma.js";
import { serializeDates } from "./serialize.js";
import { gameIdentity, SOURCE_COLUMN } from "./gameSources/index.js";
import type { SourcedHit } from "./gameSearch.js";

/** Attaches the game each hit already is, by source id alone: titles can collide. */
export async function withLibraryGames(hits: SourcedHit[]) {
  const games = await prisma.game.findMany({
    where: { OR: hits.map((hit) => gameIdentity(hit.source, hit.externalId)) },
  });
  return hits.map((hit) => {
    const game = games.find(
      (row) => row[SOURCE_COLUMN[hit.source]] === hit.externalId,
    );
    return { ...hit, game: game ? serializeDates(game) : null };
  });
}
