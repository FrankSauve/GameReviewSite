import { badInput } from "../badInput.js";
import { rawgSource } from "./rawg.js";
import { steamSource } from "./steam.js";
import type { GameSource, GameSourceId } from "./types.js";

export type { GameSourceId } from "./types.js";

/** A game's identity at a source, shaped as a `Game` unique lookup and write. */
export type GameIdentity =
  { steamAppId: string } | { tgdbId: string } | { rawgId: string };

export const SOURCE_COLUMN = {
  STEAM: "steamAppId",
  TGDB: "tgdbId",
  RAWG: "rawgId",
} as const;

export function gameIdentity(
  source: GameSourceId,
  externalId: string,
): GameIdentity {
  switch (source) {
    case "STEAM":
      return { steamAppId: externalId };
    case "TGDB":
      return { tgdbId: externalId };
    case "RAWG":
      return { rawgId: externalId };
  }
}

export function gameSource(id: GameSourceId): GameSource {
  if (id === "RAWG") return rawgSource;
  if (id === "STEAM") return steamSource;
  throw badInput(`${id} is not a game source yet.`);
}

/** Every source numbers its games; this is also what its detail fetch is sent. */
export function validateExternalId(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{1,12}$/.test(trimmed))
    throw badInput("externalId must be a positive integer.");
  return trimmed;
}
