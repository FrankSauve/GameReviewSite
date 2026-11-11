import { badInput } from "../badInput.js";
import { createGameSearch, type Lookup } from "../gameSearch.js";
import { rawgSource } from "./rawg.js";
import { searchSteamDlc, steamBannerUrl, steamSource } from "./steam.js";
import { tgdbSource } from "./tgdb.js";
import type { GameSource, GameSourceId } from "./types.js";

export type { GameSourceId } from "./types.js";

export const SOURCE_COLUMN = {
  STEAM: "steamAppId",
  TGDB: "tgdbId",
  RAWG: "rawgId",
} as const;

type SourceColumn = (typeof SOURCE_COLUMN)[GameSourceId];

/** A game's identity at a source, shaped as a `Game` unique lookup and write. */
export type GameIdentity = {
  [Column in SourceColumn]: Record<Column, string>;
}[SourceColumn];

export const gameIdentity = (
  source: GameSourceId,
  externalId: string,
): GameIdentity => ({ [SOURCE_COLUMN[source]]: externalId }) as GameIdentity;

const SOURCES: Record<GameSourceId, GameSource> = {
  STEAM: steamSource,
  TGDB: tgdbSource,
  RAWG: rawgSource,
};

const lookup = (source: GameSource): Lookup => ({
  name: source.id,
  source: source.id,
  enabled: () => source.enabled?.() ?? true,
  search: (query) => source.search(query),
});

const steam = lookup(steamSource);
const tgdb = lookup(tgdbSource);
const rawg = lookup(rawgSource);

/** Steam leads because the library is nearly all PC. It answers a console title
 *  with the wrong games, not with nothing, which is why EVERYWHERE exists. */
export const gameSearch = createGameSearch({
  DEFAULT: { fallback: [steam, tgdb, rawg] },
  EVERYWHERE: {
    lead: [steam],
    fallback: [tgdb, rawg],
    emptyFallsThrough: true,
    extra: [{ name: "STEAM_DLC", source: "STEAM", search: searchSteamDlc }],
  },
});

export const gameDetail = (source: GameSourceId, externalId: string) =>
  gameSearch.detail(SOURCES[source], externalId);

/** Wide art for a banner, from whichever source the cover came from; null when it has none. */
export const bannerUrl = (coverUrl: string | null | undefined) =>
  steamBannerUrl(coverUrl);

export const sourceEnabled = (source: GameSourceId) =>
  SOURCES[source].enabled?.() ?? true;

/** Every source numbers its games. No leading zero: "07" would be a second row for 7. */
export function validateExternalId(value: string): string {
  const trimmed = value.trim();
  if (!/^[1-9]\d{0,11}$/.test(trimmed))
    throw badInput("externalId must be a positive integer.");
  return trimmed;
}
