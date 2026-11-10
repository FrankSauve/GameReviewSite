import { coverUrl } from "./gameSources/fields.js";
import { COVER_DOMAIN as STEAM_COVER_DOMAIN } from "./gameSources/steam.js";
import { COVER_HOSTS as TGDB_COVER_HOSTS } from "./gameSources/tgdb.js";
import type { GameSourceId } from "./gameSources/types.js";

export interface CoverIdentity {
  steamAppId: string | null;
  tgdbId: string | null;
}

/** True for any cover not already on a host the live sources serve from. */
export function needsNewCover(url: string | null): boolean {
  return coverUrl(url, [STEAM_COVER_DOMAIN, ...TGDB_COVER_HOSTS]) === null;
}

/** A library game holds a TheGamesDB id only where Steam's art is not the game's. */
export function coverSource(
  game: CoverIdentity,
): { source: Exclude<GameSourceId, "RAWG">; externalId: string } | null {
  if (game.tgdbId) return { source: "TGDB", externalId: game.tgdbId };
  if (game.steamAppId) return { source: "STEAM", externalId: game.steamAppId };
  return null;
}
