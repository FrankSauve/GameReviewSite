import { describe, expect, it } from "vitest";
import {
  AWARD_RANK_MAX,
  awardableYears,
  defaultAwardYear,
  draftProblem,
  gamesPlayedIn,
  moveItem,
  parseAwardYear,
  withAwardYear,
} from "../src/lib/awards";
import type { ReviewSummary } from "../src/lib/grouping";

const summary = (
  id: string,
  title: string,
  yearPlayed: number | null,
): ReviewSummary => ({
  id: `r-${id}`,
  rating: 8,
  yearPlayed,
  createdAt: "2026-01-01T00:00:00.000Z",
  commentCount: 0,
  game: { id, title },
});

const game = (id: string) => ({ id, title: id });

describe("award years", () => {
  const reviews = [
    summary("a", "Celeste", 2022),
    summary("b", "Hades", 2024),
    summary("c", "Elden Ring", 2024),
    summary("d", "Undated", null),
  ];

  it("offers every year played and every year with awards, newest first", () => {
    expect(awardableYears(reviews, [2020, 2024])).toEqual([2024, 2022, 2020]);
  });

  it("opens on the newest year with awards", () => {
    expect(defaultAwardYear(reviews, [2022])).toBe(2022);
  });

  it("opens on the newest year played when none has awards", () => {
    expect(defaultAwardYear(reviews, [])).toBe(2024);
  });

  it("has no year for a profile with no dated reviews", () => {
    expect(defaultAwardYear([summary("d", "Undated", null)], [])).toBeNull();
  });

  it("offers only the games played in the year, by title", () => {
    expect(gamesPlayedIn(reviews, 2024).map((g) => g.title)).toEqual([
      "Elden Ring",
      "Hades",
    ]);
  });

  it.each([
    ["2024", 2024],
    [undefined, null],
    ["24", null],
    ["2024x", null],
    ["1900", null],
    ["2099", null],
  ])("reads the year segment %s as %s", (segment, year) => {
    expect(parseAwardYear(segment, new Date("2026-06-01"))).toBe(year);
  });

  it("adds a year a save filled and drops one it emptied", () => {
    expect(withAwardYear([2022], 2024, true)).toEqual([2024, 2022]);
    expect(withAwardYear([2024, 2022], 2024, true)).toEqual([2024, 2022]);
    expect(withAwardYear([2024, 2022], 2024, false)).toEqual([2022]);
  });
});

describe("the award draft", () => {
  it("can save an empty year, which clears it", () => {
    expect(draftProblem({ ranking: [], categories: [] })).toBeNull();
  });

  it.each([
    [
      "too many ranks",
      {
        ranking: Array.from({ length: AWARD_RANK_MAX + 1 }, (_, i) =>
          game(`g${i}`),
        ),
        categories: [],
      },
    ],
    [
      "an unnamed award",
      { ranking: [], categories: [{ name: " ", game: game("a") }] },
    ],
    [
      "an award with no winner",
      { ranking: [], categories: [{ name: "X", game: null }] },
    ],
    [
      "names equal ignoring case",
      {
        ranking: [],
        categories: [
          { name: "Best Boss", game: game("a") },
          { name: "best boss", game: game("b") },
        ],
      },
    ],
  ])("refuses %s", (_label, draft) => {
    expect(draftProblem(draft)).not.toBeNull();
  });

  it("moves an entry and ignores a move off either end", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});
