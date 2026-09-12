import { badInput } from "./badInput.js";

/**
 * The categories a profile may fill in on its Favorites grid, in the order the
 * grid draws them.
 *
 * Duplicated as FAVORITE_CATEGORIES in frontend/src/lib/favoriteCategories.ts;
 * this copy is authoritative for the keys and the labels below, and is the one
 * that refuses a write. The labels are British and the keys are not: a key is
 * stored on every row, so respelling one would orphan its picks.
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

const LABELS = new Map<string, string>([
  ["favorite-game", "Favourite Game"],
  ["favorite-series", "Favourite Series"],
  ["best-story", "Best Story"],
  ["favorite-art-style", "Favourite Art Style"],
  ["biggest-personal-impact", "Biggest Personal Impact"],
  ["best-combat", "Best Combat"],
  ["underrated", "Underrated"],
  ["overrated", "Overrated"],
  ["worst-game", "Worst Game"],
  ["favorite-protagonist", "Favourite Protagonist"],
  ["favorite-antagonist", "Favourite Antagonist"],
  ["best-soundtrack", "Best Soundtrack"],
  ["best-multiplayer", "Best Multiplayer"],
  ["not-usually-my-thing", "Not Usually My Thing, But…"],
  ["turn-my-brain-off", "Turn My Brain Off"],
  ["best-with-friends", "Best With Friends"],
  ["best-coop", "Best Coop"],
  ["best-retro-game", "Best Retro Game"],
  ["nostalgic-childhood-game", "Nostalgic Childhood Game"],
  ["game-everyone-should-play", "Game Everyone Should Play"],
]);

export function labelFor(key: string): string {
  return LABELS.get(key) ?? key;
}

const ORDER = new Map(FAVORITE_CATEGORIES.map((key, i) => [key as string, i]));

/** The grid draws them in this order, so anything rendering picks sorts to match. */
export function inGridOrder<T extends { category: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      (ORDER.get(a.category) ?? ORDER.size) -
      (ORDER.get(b.category) ?? ORDER.size),
  );
}
