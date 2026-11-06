import type { Game } from "../generated/prisma/client.js";
import { mightBeSameGame } from "./gameMatch.js";
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

/**
 * A game the reader may mean instead, for them to confirm: a false split is
 * fixable, but a false merge files reviews under the wrong game.
 */
export async function possibleLibraryGame(fields: {
  title: string;
  releaseYear: number | null;
}): Promise<Game | null> {
  const games = await prisma.game.findMany({ orderBy: { createdAt: "asc" } });
  return games.find((game) => mightBeSameGame(fields, game)) ?? null;
}
