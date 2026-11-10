import { COVER_HOSTS as RAWG_COVER_HOSTS } from "./gameSources/rawg.js";
import type { GameSourceId } from "./gameSources/types.js";

export interface CoverIdentity {
  steamAppId: string | null;
  tgdbId: string | null;
}

/** RAWG's API is gone, so a cover it hosts is one outage from a broken image. */
export function needsNewCover(coverUrl: string | null): boolean {
  if (!coverUrl) return true;
  try {
    return RAWG_COVER_HOSTS.includes(new URL(coverUrl).hostname);
  } catch {
    return true;
  }
}

/**
 * TheGamesDB wins over Steam: a library game holds a TheGamesDB id only when
 * Steam has no page for it, or Steam's page is a re-release with its own art.
 */
export function coverSource(
  game: CoverIdentity,
): { source: Exclude<GameSourceId, "RAWG">; externalId: string } | null {
  if (game.tgdbId) return { source: "TGDB", externalId: game.tgdbId };
  if (game.steamAppId) return { source: "STEAM", externalId: game.steamAppId };
  return null;
}
