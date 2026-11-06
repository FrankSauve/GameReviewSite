import type { Game } from "../generated/prisma/client.js";
import { closestGame } from "./gameMatch.js";
import { prisma } from "./prisma.js";
import { serializeDates } from "./serialize.js";
import { gameIdentity, SOURCE_COLUMN } from "./gameSources/index.js";
import type { SourcedHit } from "./gameSearch.js";

const idsOf = (hit: SourcedHit) => [hit.externalId, ...(hit.otherIds ?? [])];

/** Attaches the game each hit already is, by source id alone: titles can collide. */
export async function withLibraryGames(hits: SourcedHit[]) {
  const games = await prisma.game.findMany({
    where: {
      OR: hits.flatMap((hit) =>
        idsOf(hit).map((id) => gameIdentity(hit.source, id)),
      ),
    },
  });
  return hits.map((hit) => {
    const ids = idsOf(hit);
    const game = games.find((row) => {
      const stored = row[SOURCE_COLUMN[hit.source]];
      return stored !== null && ids.includes(stored);
    });
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
  const games = await prisma.game.findMany({
    select: { id: true, title: true, releaseYear: true },
    orderBy: { createdAt: "asc" },
  });
  const match = closestGame(fields, games);
  return match ? prisma.game.findUnique({ where: { id: match.id } }) : null;
}
