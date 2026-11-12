import type { GameSource } from "./types.js";

/** RAWG's API is gone. Its ids stay, so a game stored under one still resolves. */
export const rawgSource: GameSource = {
  id: "RAWG",
  enabled: () => false,
  search: () => Promise.resolve([]),
  detail: () => Promise.resolve(null),
};
