import { serializeDates } from "../lib/serialize.js";
import type { Context } from "../context.js";

/** The `game` field of any row that carries a gameId, batched per request. */
export async function gameOf(
  parent: { gameId: string },
  _args: unknown,
  { loaders }: Context,
) {
  const game = await loaders.gameById.load(parent.gameId);
  return game ? serializeDates(game) : null;
}
