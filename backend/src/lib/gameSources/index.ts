import { badInput } from "../badInput.js";
import { createGameSearch, type Lookup } from "../gameSearch.js";
import { rawgSource } from "./rawg.js";
import { searchSteamDlc, steamSource } from "./steam.js";
import { tgdbSource } from "./tgdb.js";
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

const SOURCES: Record<GameSourceId, GameSource> = {
  STEAM: steamSource,
  TGDB: tgdbSource,
  RAWG: rawgSource,
};

export const gameSource = (id: GameSourceId): GameSource => SOURCES[id];

const lookup = (source: GameSource): Lookup => ({
  name: source.id,
  source: source.id,
  enabled: () => source.enabled?.() ?? true,
  search: (query) => source.search(query),
});

const steam = lookup(steamSource);
const tgdb = lookup(tgdbSource);
const rawg = lookup(rawgSource);

/**
 * Steam first because the library is nearly all PC. It answers a console title
 * with a confident list of the wrong games, so nothing here can fall through to
 * TheGamesDB on its own: that takes the reader's "search everywhere".
 */
export const gameSearch = createGameSearch({
  DEFAULT: { fallback: [steam, tgdb, rawg] },
  EVERYWHERE: {
    lead: [steam],
    fallback: [tgdb, rawg],
    emptyFallsThrough: true,
    extra: [{ name: "STEAM_DLC", source: "STEAM", search: searchSteamDlc }],
  },
});

/** Every source numbers its games. No leading zero: "07" would be a second row for 7. */
export function validateExternalId(value: string): string {
  const trimmed = value.trim();
  if (!/^[1-9]\d{0,11}$/.test(trimmed))
    throw badInput("externalId must be a positive integer.");
  return trimmed;
}
