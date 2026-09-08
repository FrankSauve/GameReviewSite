/**
 * The categories the Favorites grid draws, in the order it draws them.
 *
 * A copy of FAVORITE_CATEGORIES in backend/src/lib/favoriteCategories.ts, which
 * is authoritative and refuses anything off it — there is no package shared
 * between the two. Change that copy too, or the grid offers a category the
 * server rejects.
 */
export const FAVORITE_CATEGORIES = [
  { key: "favorite-game", label: "Favorite Game" },
  { key: "favorite-series", label: "Favorite Series" },
  { key: "best-story", label: "Best Story" },
  { key: "favorite-art-style", label: "Favorite Art Style" },
  { key: "biggest-personal-impact", label: "Biggest Personal Impact" },
  { key: "best-combat", label: "Best Combat" },
  { key: "underrated", label: "Underrated" },
  { key: "overrated", label: "Overrated" },
  { key: "worst-game", label: "Worst Game" },
  { key: "favorite-protagonist", label: "Favorite Protagonist" },
  { key: "favorite-antagonist", label: "Favorite Antagonist" },
  { key: "best-soundtrack", label: "Best Soundtrack" },
  { key: "best-multiplayer", label: "Best Multiplayer" },
  { key: "not-usually-my-thing", label: "Not Usually My Thing, But…" },
  { key: "turn-my-brain-off", label: "Turn My Brain Off" },
  { key: "best-with-friends", label: "Best With Friends" },
  { key: "best-coop", label: "Best Coop" },
  { key: "best-retro-game", label: "Best Retro Game" },
  { key: "nostalgic-childhood-game", label: "Nostalgic Childhood Game" },
  { key: "game-everyone-should-play", label: "Game Everyone Should Play" },
] as const;

const LABELS = new Map(
  FAVORITE_CATEGORIES.map((c) => [c.key as string, c.label as string]),
);

/** Falls back to the key so a category this copy has not caught up to still draws. */
export function labelFor(key: string): string {
  return LABELS.get(key) ?? key;
}
