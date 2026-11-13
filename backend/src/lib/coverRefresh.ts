import { coverUrl } from "./gameSources/fields.js";
import { SourceUnavailableError } from "./gameSources/http.js";
import { COVER_DOMAIN as STEAM_COVER_DOMAIN } from "./gameSources/steam.js";
import { COVER_HOSTS as TGDB_COVER_HOSTS } from "./gameSources/tgdb.js";
import type { GameSourceId } from "./gameSources/types.js";

export interface CoverIdentity {
  steamAppId: string | null;
  tgdbId: string | null;
}

const SOURCE_HOSTS = {
  STEAM: [STEAM_COVER_DOMAIN],
  TGDB: TGDB_COVER_HOSTS,
};

/** A cover not from the game's own source; with none, one off every live source's hosts. */
export function needsNewCover(
  game: CoverIdentity & { coverUrl: string | null },
): boolean {
  const plan = coverSource(game);
  const hosts = plan
    ? SOURCE_HOSTS[plan.source]
    : [...SOURCE_HOSTS.STEAM, ...SOURCE_HOSTS.TGDB];
  return coverUrl(game.coverUrl, hosts) === null;
}

/**
 * A library game holds a TheGamesDB id only where Steam has no page for it, or
 * where Steam's page is a re-release with its own art, so that id wins.
 */
export function coverSource(
  game: CoverIdentity,
): { source: Exclude<GameSourceId, "RAWG">; externalId: string } | null {
  if (game.tgdbId) return { source: "TGDB", externalId: game.tgdbId };
  if (game.steamAppId) return { source: "STEAM", externalId: game.steamAppId };
  return null;
}

/** An outage says nothing about the id asked for, unlike any other failure. */
export function isOutage(err: unknown): boolean {
  return err instanceof SourceUnavailableError;
}

export function failureReason(err: unknown): string {
  if (err instanceof SourceUnavailableError) return err.reason;
  return err instanceof Error ? err.message : String(err);
}
