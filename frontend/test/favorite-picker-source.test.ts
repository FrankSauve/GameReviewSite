import { describe, expect, it } from "vitest";
import { pickableGames } from "../src/lib/favorites";
import type { ReviewSummary } from "../src/lib/grouping";

const summary = (
  id: string,
  game: { id: string; title: string } | null,
): ReviewSummary => ({
  id,
  rating: 8,
  yearPlayed: 2024,
  hoursPlayed: 10,
  createdAt: "2026-01-01T00:00:00.000Z",
  commentCount: 0,
  game: game
    ? { ...game, slug: game.title.toLowerCase(), coverUrl: null }
    : null,
});

/** Favorites are picked from the games the account has reviewed, nothing else. */
describe("the games a profile may favorite", () => {
  it("lists each reviewed game once, by title", () => {
    const games = pickableGames([
      summary("r1", { id: "g2", title: "Hades" }),
      summary("r2", { id: "g1", title: "Elden Ring" }),
    ]);
    expect(games.map((g) => g.title)).toEqual(["Elden Ring", "Hades"]);
  });

  it("collapses two reviews of one game", () => {
    const games = pickableGames([
      summary("r1", { id: "g1", title: "Elden Ring" }),
      summary("r2", { id: "g1", title: "Elden Ring" }),
    ]);
    expect(games).toHaveLength(1);
  });

  it("skips a summary whose game is missing", () => {
    expect(pickableGames([summary("r1", null)])).toEqual([]);
  });

  it("is empty for an account that has reviewed nothing", () => {
    expect(pickableGames([])).toEqual([]);
  });
});
