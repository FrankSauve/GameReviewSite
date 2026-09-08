import { badInput } from "./badInput.js";

/**
 * The categories a profile may fill in on its Favorites grid.
 *
 * Duplicated as FAVORITE_CATEGORIES in frontend/src/lib/favoriteCategories.ts,
 * which pairs each key with its label and the order the grid draws them; this
 * copy is authoritative and is the one that refuses a write.
 */
export const FAVORITE_CATEGORIES = [
  "favorite-game",
  "favorite-series",
  "best-story",
  "favorite-art-style",
  "biggest-personal-impact",
  "best-combat",
  "underrated",
  "overrated",
  "worst-game",
  "favorite-protagonist",
  "favorite-antagonist",
  "best-soundtrack",
  "best-multiplayer",
  "not-usually-my-thing",
  "turn-my-brain-off",
  "best-with-friends",
  "best-coop",
  "best-retro-game",
  "nostalgic-childhood-game",
  "game-everyone-should-play",
] as const;

const KNOWN = new Set<string>(FAVORITE_CATEGORIES);

/**
 * Matched exactly, unlike a platform: these are slugs the client never types,
 * so a case fold would only let two spellings write to the same row.
 */
export function validateFavoriteCategory(value: string): string {
  const key = value.trim();
  if (!KNOWN.has(key))
    throw badInput("category must be one of the categories offered.");
  return key;
}
