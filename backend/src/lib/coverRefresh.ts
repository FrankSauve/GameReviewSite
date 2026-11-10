import { GraphQLError } from "graphql";
import { coverUrl } from "./gameSources/fields.js";
import { COVER_DOMAIN as STEAM_COVER_DOMAIN } from "./gameSources/steam.js";
import { COVER_HOSTS as TGDB_COVER_HOSTS } from "./gameSources/tgdb.js";
import type { GameSourceId } from "./gameSources/types.js";

export interface CoverIdentity {
  steamAppId: string | null;
  tgdbId: string | null;
}

/** True for any cover not on Steam's or TheGamesDB's image hosts, RAWG's included. */
export function needsNewCover(url: string | null): boolean {
  return coverUrl(url, [STEAM_COVER_DOMAIN, ...TGDB_COVER_HOSTS]) === null;
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

/** sourceUnavailable's message is the reader's; the cause is on originalError. */
export function failureReason(err: unknown): string {
  if (err instanceof GraphQLError && err.originalError)
    return err.originalError.message;
  return err instanceof Error ? err.message : String(err);
}
