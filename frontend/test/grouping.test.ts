import { describe, expect, it } from "vitest";
import {
  ORDER_FOR,
  groupByScore,
  groupByYear,
  groupReviews,
  type ReviewSummary,
} from "../src/lib/grouping";

let seq = 0;
function review(
  rating: number,
  yearPlayed: number | null,
  hoursPlayed: number | null = 10,
): ReviewSummary {
  seq += 1;
  return {
    id: `r${seq}`,
    rating,
    yearPlayed,
    hoursPlayed,
    createdAt: "2026-01-01T00:00:00.000Z",
    commentCount: 0,
    game: { id: `g${seq}`, title: `Game ${seq}` },
  };
}

describe("groupByYear", () => {
  it("orders years newest first", () => {
    const groups = groupByYear([
      review(8, 2015),
      review(9, 2024),
      review(7, 2019),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["2024", "2019", "2015"]);
  });

  it("collects several reviews under one year", () => {
    const groups = groupByYear([
      review(8, 2020),
      review(6, 2020),
      review(9, 2021),
    ]);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["2021", 1],
      ["2020", 2],
    ]);
  });

  /**
   * A gap year renders as nothing, not an empty heading: a profile is a record of
   * what someone played, and a run of empty labels says nothing.
   */
  it("omits years with no reviews", () => {
    const groups = groupByYear([review(8, 2016), review(9, 2024)]);
    expect(groups.map((g) => g.label)).toEqual(["2024", "2016"]);
  });

  /** The imported-backlog case: an unknown year must not be filed under this one. */
  it("puts reviews with no year in a trailing group", () => {
    const groups = groupByYear([
      review(8, null),
      review(9, 2024),
      review(7, 2019),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "2024",
      "2019",
      "Year unknown",
    ]);
  });

  it("has no unknown group when every review has a year", () => {
    const groups = groupByYear([review(9, 2024), review(7, 2019)]);
    expect(groups.map((g) => g.key)).not.toContain("unknown");
  });

  it("returns nothing for no reviews", () => {
    expect(groupByYear([])).toEqual([]);
  });
});

describe("groupByScore", () => {
  it("orders scores highest first, half points included", () => {
    const groups = groupByScore([
      review(8, 2020),
      review(10, 2020),
      review(9.5, 2020),
      review(8.5, 2020),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["10", "9.5", "8.5", "8"]);
  });

  it("keeps a whole score and its half apart", () => {
    const groups = groupByScore([review(9, 2020), review(9.5, 2020)]);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["9.5", 1],
      ["9", 1],
    ]);
  });

  /** Nineteen headings would make a profile mostly empty labels. */
  it("omits scores nobody has given", () => {
    const groups = groupByScore([review(10, 2020), review(7, 2020)]);
    expect(groups.map((g) => g.label)).toEqual(["10", "7"]);
  });

  it("labels a whole score without a trailing zero", () => {
    expect(groupByScore([review(9, 2020)])[0].label).toBe("9");
  });

  it("returns nothing for no reviews", () => {
    expect(groupByScore([])).toEqual([]);
  });
});

describe("group totals", () => {
  it("averages the scores within a year", () => {
    const groups = groupByYear([review(8, 2020), review(9, 2020)]);
    expect(groups[0].average).toBe(8.5);
  });

  it("sums the hours within a group", () => {
    const groups = groupByYear([review(8, 2020, 12), review(9, 2020, 30.5)]);
    expect(groups[0].hours).toBe(42.5);
  });

  /** A group of reviews that predate hoursPlayed has no total to show. */
  it("reports no hours when none are recorded", () => {
    const groups = groupByYear([review(8, 2020, null), review(9, 2020, null)]);
    expect(groups[0].hours).toBeNull();
  });

  it("sums only the recorded hours in a mixed group", () => {
    const groups = groupByYear([review(8, 2020, 12), review(9, 2020, null)]);
    expect(groups[0].hours).toBe(12);
  });
});

describe("groupReviews", () => {
  it("leaves the recent view as one undivided list in server order", () => {
    const rows = [review(6, 2011), review(10, 2024)];
    const groups = groupReviews(rows, "recent");
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(rows.map((r) => r.id));
  });

  it("returns nothing for the recent view with no reviews", () => {
    expect(groupReviews([], "recent")).toEqual([]);
  });

  it("dispatches to the year and score groupings", () => {
    const rows = [review(8, 2015), review(10, 2024)];
    expect(groupReviews(rows, "year").map((g) => g.label)).toEqual([
      "2024",
      "2015",
    ]);
    expect(groupReviews(rows, "score").map((g) => g.label)).toEqual([
      "10",
      "8",
    ]);
  });
});

describe("ORDER_FOR", () => {
  /**
   * Each grouping needs the server to have sorted along its own axis, or the
   * groups come out ordered correctly with their contents shuffled.
   */
  it("asks the server for the axis each view groups on", () => {
    expect(ORDER_FOR.year).toBe("YEAR_DESC");
    expect(ORDER_FOR.score).toBe("RATING_DESC");
    expect(ORDER_FOR.recent).toBe("RECENT");
  });
});
