import { describe, expect, it } from "vitest";
import {
  ORDER_FOR,
  groupByGenre,
  filterByGenre,
  genreFilterOptions,
  genreSuggestions,
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
    expect(groupByScore([review(9, 2020)])[0]?.label).toBe("9");
  });

  it("returns nothing for no reviews", () => {
    expect(groupByScore([])).toEqual([]);
  });
});

function withGenres(
  rating: number,
  genres: string[] | undefined,
): ReviewSummary {
  const base = review(rating, 2020);
  return {
    ...base,
    game: {
      id: `g-${base.id}`,
      title: base.id,
      ...(genres ? { genres } : {}),
    },
  };
}

describe("groupByGenre", () => {
  it("files a review under its reviewer's genre over the game's", () => {
    const hollowKnight = {
      ...withGenres(9, ["Action", "Platformer"]),
      genre: "Metroidvania",
    };
    expect(groupByGenre([hollowKnight]).map((g) => g.label)).toEqual([
      "Metroidvania",
    ]);
  });

  /** The heading a game lands under, among the groups of a library. */
  function filed(rows: ReviewSummary[], target: ReviewSummary) {
    return groupByGenre(rows).find((g) =>
      g.items.some((i) => i.id === target.id),
    )?.label;
  }

  it("falls back to the game's genre rarest in the library", () => {
    const hollowKnight = withGenres(9, ["Action", "Indie", "Platformer"]);
    const rows = [
      hollowKnight,
      withGenres(8, ["Action", "Platformer"]),
      withGenres(7, ["Action", "Indie"]),
      withGenres(6, ["Action", "Indie"]),
    ];
    expect(filed(rows, hollowKnight)).toBe("Platformer");
  });

  it("breaks a rarity tie towards the game's own order", () => {
    const rows = [
      withGenres(9, ["RPG", "Action"]),
      withGenres(8, ["RPG", "Action"]),
    ];
    expect(groupByGenre(rows).map((g) => g.label)).toEqual(["RPG"]);
  });

  /** Otherwise a library of Action-plus-something games is a heading per row. */
  it("passes over a genre no other game shares", () => {
    const rows = [
      withGenres(9, ["Action", "Shooter"]),
      withGenres(8, ["Action", "Racing"]),
      withGenres(7, ["Action", "Sports"]),
    ];
    expect(groupByGenre(rows).map((g) => [g.label, g.items.length])).toEqual([
      ["Action", 3],
    ]);
  });

  it("files a lone game under its first genre", () => {
    expect(
      groupByGenre([withGenres(9, ["Shooter", "Action"])]).map((g) => g.label),
    ).toEqual(["Shooter"]);
  });

  it("prefers a genre of the game's the reviewer already files under", () => {
    const witcher = withGenres(9, ["Action", "Adventure", "RPG"]);
    const rows = [
      witcher,
      { ...withGenres(8, ["Action"]), genre: "rpg" },
      withGenres(7, ["Action", "Adventure"]),
      withGenres(6, ["Action", "Adventure"]),
    ];
    expect(filed(rows, witcher)?.toLowerCase()).toBe("rpg");
  });

  /** One game filed under Action once moved 90 of a reviewer's games there. */
  it("does not pull the library under a broad genre filed once", () => {
    const doom = withGenres(9, ["Action", "Shooter"]);
    const rows = [
      doom,
      withGenres(8, ["Action", "Shooter"]),
      withGenres(7, ["Action", "RPG"]),
      withGenres(6, ["Action", "RPG"]),
      { ...withGenres(5, ["Action", "Adventure"]), genre: "Action" },
    ];
    expect(filed(rows, doom)).toBe("Shooter");
  });

  it("breaks a rarity tie towards a genre the reviewer files under", () => {
    const portal = withGenres(9, ["Puzzle", "Platformer"]);
    const rows = [
      portal,
      withGenres(8, ["Puzzle", "Platformer"]),
      { ...withGenres(7, ["Indie"]), genre: "Platformer" },
    ];
    expect(filed(rows, portal)).toBe("Platformer");
  });

  it("leaves games the reviewer filed out of a fallback's rarity", () => {
    const celeste = withGenres(9, ["Indie", "Platformer"]);
    const unfiled = [
      celeste,
      withGenres(8, ["Indie", "Platformer"]),
      withGenres(7, ["Indie", "Platformer"]),
    ];
    const before = filed(unfiled, celeste);
    const filedAway = [
      { ...withGenres(6, ["Indie"]), genre: "Roguelike" },
      { ...withGenres(5, ["Indie"]), genre: "Roguelike" },
    ];
    expect(filed([...unfiled, ...filedAway], celeste)).toBe(before);
  });

  it("lists every review exactly once", () => {
    const rows = [
      withGenres(9, ["Action", "RPG"]),
      withGenres(8, ["Action", "Shooter"]),
      withGenres(7, ["Action", "Adventure", "RPG"]),
      { ...withGenres(6, ["Action"]), genre: "Roguelike" },
      withGenres(5, []),
    ];
    const ids = groupByGenre(rows).flatMap((g) => g.items.map((i) => i.id));
    expect(ids.sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it("merges reviewers' genres differing only in case", () => {
    const groups = groupByGenre([
      { ...withGenres(9, []), genre: "Metroidvania" },
      { ...withGenres(8, ["Action"]), genre: "metroidvania" },
    ]);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Metroidvania", 2],
    ]);
  });

  it("ignores a blank genre of the reviewer's own", () => {
    const groups = groupByGenre([{ ...withGenres(9, ["RPG"]), genre: "  " }]);
    expect(groups.map((g) => g.label)).toEqual(["RPG"]);
  });

  it("orders genres by game count, then by name", () => {
    const groups = groupByGenre([
      withGenres(8, ["Puzzle"]),
      { ...withGenres(7, ["Strategy"]), genre: "RPG" },
      withGenres(6, ["RPG"]),
      withGenres(5, ["Adventure"]),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["RPG", "Adventure", "Puzzle"]);
  });

  it("keeps the server's order within a genre", () => {
    const rows = [withGenres(10, ["RPG"]), withGenres(6, ["RPG"])];
    expect(groupByGenre(rows)[0]?.items.map((i) => i.id)).toEqual(
      rows.map((r) => r.id),
    );
  });

  it("puts reviews with no genre in a trailing group", () => {
    const groups = groupByGenre([
      withGenres(8, []),
      withGenres(7, undefined),
      { ...review(6, 2020), game: null },
      withGenres(9, ["RPG"]),
    ]);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["RPG", 1],
      ["No genre", 3],
    ]);
  });

  it("keeps a genre called unknown apart from the no-genre group", () => {
    const keys = groupByGenre([
      withGenres(8, ["unknown"]),
      withGenres(7, []),
    ]).map((g) => g.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("treats genres differing only in case as one group", () => {
    const groups = groupByGenre([
      withGenres(9, ["RPG"]),
      withGenres(8, ["rpg"]),
    ]);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([["RPG", 2]]);
  });

  /** Server order is by score, so naming by first-seen would rename on a re-score. */
  it("names a genre by its commonest spelling, whatever the order", () => {
    const rows = [
      withGenres(10, ["rpg"]),
      withGenres(9, ["RPG"]),
      withGenres(8, ["RPG"]),
    ];
    expect(groupByGenre(rows)[0]?.label).toBe("RPG");
    expect(groupByGenre([...rows].reverse())[0]?.label).toBe("RPG");
  });

  it("breaks a spelling tie towards capitals, whatever the order", () => {
    const rows = [withGenres(10, ["action"]), withGenres(9, ["Action"])];
    expect(groupByGenre(rows)[0]?.label).toBe("Action");
    expect(groupByGenre([...rows].reverse())[0]?.label).toBe("Action");
  });

  it("files a game that names one genre twice under it once", () => {
    const groups = groupByGenre([withGenres(9, ["RPG", "RPG", "rpg"])]);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([["RPG", 1]]);
  });

  it("returns nothing for no reviews", () => {
    expect(groupByGenre([])).toEqual([]);
  });
});

describe("groupByGenre with community genres", () => {
  /** A game other reviewers filed under `community`, which this reviewer left unfiled. */
  function filedByOthers(
    rating: number,
    genres: string[],
    community: string[],
  ): ReviewSummary {
    const base = withGenres(rating, genres);
    return {
      ...base,
      game: {
        id: `g-${base.id}`,
        title: base.id,
        genres,
        communityGenres: community,
      },
    };
  }

  it("files an unfiled review under the genre others filed the game under", () => {
    const rows = [
      filedByOthers(9, ["Action", "Indie"], ["Survival Horror"]),
      withGenres(8, ["Action", "Indie"]),
      withGenres(7, ["Action", "Indie"]),
    ];
    expect(groupByGenre(rows).map((g) => [g.label, g.items.length])).toEqual([
      ["Action", 2],
      ["Survival Horror", 1],
    ]);
  });

  it("keeps the reviewer's own genre over the community's", () => {
    const own = {
      ...filedByOthers(9, ["Action"], ["Horror"]),
      genre: "Shooter",
    };
    expect(groupByGenre([own]).map((g) => g.label)).toEqual(["Shooter"]);
  });

  it("merges a community genre into the reviewer's heading of that name", () => {
    const rows = [
      { ...withGenres(9, []), genre: "RPG" },
      filedByOthers(8, ["Action"], ["rpg"]),
    ];
    expect(groupByGenre(rows).map((g) => [g.label, g.items.length])).toEqual([
      ["RPG", 2],
    ]);
  });

  /** A community genre is someone else's filing, so it lifts no RAWG genre past the floor. */
  it("does not count a community genre as the reviewer's filing", () => {
    const lone = withGenres(7, ["Action", "Puzzle"]);
    const rows = [
      filedByOthers(9, ["Puzzle"], ["Puzzle"]),
      lone,
      withGenres(6, ["Action", "Strategy"]),
    ];
    expect(
      groupByGenre(rows).find((g) => g.items.some((i) => i.id === lone.id))
        ?.label,
    ).toBe("Action");
  });

  it("offers a community heading in the genre filter", () => {
    const rows = [filedByOthers(9, ["Action"], ["Horror"])];
    expect(genreFilterOptions(rows)).toEqual(["Horror"]);
    expect(filterByGenre(rows, "horror")).toEqual(rows);
  });
});

describe("genreSuggestions", () => {
  it("offers the profile's headings biggest first, then the game's genres", () => {
    const rows = [
      { ...withGenres(9, []), genre: "Metroidvania" },
      { ...withGenres(8, []), genre: "metroidvania" },
      { ...withGenres(7, []), genre: "RPG" },
      withGenres(6, []),
    ];
    expect(genreSuggestions(rows, ["Action", "rpg", "Action"])).toEqual([
      "Metroidvania",
      "RPG",
      "Action",
    ]);
  });

  it("offers secondary genres after the headings, most used first, before the game's", () => {
    const rows = [
      { ...withGenres(9, []), genre: "Action", secondaryGenres: ["Horror"] },
      {
        ...withGenres(8, []),
        genre: "Shooter",
        secondaryGenres: ["horror", "Open World", "action"],
      },
      { ...withGenres(7, []), secondaryGenres: ["Horror"] },
    ];
    expect(genreSuggestions(rows, ["Puzzle", "open world"])).toEqual([
      "Action",
      "Shooter",
      "Horror",
      "Open World",
      "Puzzle",
    ]);
  });
});

describe("group totals", () => {
  it("averages the scores within a year", () => {
    const groups = groupByYear([review(8, 2020), review(9, 2020)]);
    expect(groups[0]?.average).toBe(8.5);
  });

  it("sums the hours within a group", () => {
    const groups = groupByYear([review(8, 2020, 12), review(9, 2020, 30.5)]);
    expect(groups[0]?.hours).toBe(42.5);
  });

  /** A group of reviews that predate hoursPlayed has no total to show. */
  it("reports no hours when none are recorded", () => {
    const groups = groupByYear([review(8, 2020, null), review(9, 2020, null)]);
    expect(groups[0]?.hours).toBeNull();
  });

  it("sums only the recorded hours in a mixed group", () => {
    const groups = groupByYear([review(8, 2020, 12), review(9, 2020, null)]);
    expect(groups[0]?.hours).toBe(12);
  });
});

describe("groupReviews", () => {
  it("leaves the recent view as one undivided list in server order", () => {
    const rows = [review(6, 2011), review(10, 2024)];
    const groups = groupReviews(rows, "recent");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(rows.map((r) => r.id));
  });

  it("returns nothing for the recent view with no reviews", () => {
    expect(groupReviews([], "recent")).toEqual([]);
  });

  it("dispatches to the genre grouping", () => {
    expect(
      groupReviews([withGenres(8, ["RPG"])], "genre").map((g) => g.label),
    ).toEqual(["RPG"]);
  });

  it("keeps a filtered review under its unfiltered genre heading", () => {
    // Unfiled. RPG is rarer than Action among all four, but not among the two filed under it.
    const rows = [
      withGenres(9, ["Action", "RPG"]),
      withGenres(8, ["Action", "RPG"]),
      withGenres(7, ["Action"]),
      withGenres(6, ["Action"]),
    ];
    const heading = (genre: string) =>
      groupReviews(rows, "genre", genre).map((g) => [g.label, g.items.length]);
    expect(heading("")).toContainEqual(["RPG", 2]);
    expect(heading("rpg")).toEqual([["RPG", 2]]);
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
    expect(ORDER_FOR.genre).toBe("RATING_DESC");
  });
});

describe("filterByGenre", () => {
  const rows = () => {
    const filed = {
      ...withGenres(9, ["Action"]),
      genre: "Action",
      secondaryGenres: ["Horror", "Story-driven"],
    };
    // Unfiled. RPG is rarer than Action among them, so it heads both.
    const fallback = withGenres(8, ["Action", "RPG"]);
    const fallback2 = withGenres(7, ["Action", "RPG"]);
    const actionOnly = withGenres(5, ["Action"]);
    const horrorOnly = {
      ...withGenres(6, []),
      genre: "Shooter",
      secondaryGenres: ["horror"],
    };
    return [filed, fallback, fallback2, actionOnly, horrorOnly] as const;
  };

  it("keeps a review whose secondary genre matches, ignoring case", () => {
    const all = rows();
    const [filed, , , , horrorOnly] = all;
    expect(filterByGenre([...all], "HORROR")).toEqual([filed, horrorOnly]);
  });

  it("keeps a review by the heading the Genre tab files it under", () => {
    const all = rows();
    const [, fallback, fallback2] = all;
    expect(filterByGenre([...all], "rpg")).toEqual([fallback, fallback2]);
  });

  /** Most games carry Action from RAWG; matching all of them would make the filter useless. */
  it("does not match a game genre the review is not filed under", () => {
    const all = rows();
    const [filed, , , actionOnly] = all;
    expect(filterByGenre([...all], "Action")).toEqual([filed, actionOnly]);
  });

  it("returns every review when the filter is blank", () => {
    const all = rows();
    expect(filterByGenre([...all], " ")).toEqual([...all]);
  });
});

describe("genreFilterOptions", () => {
  it("offers headings and secondary genres once each, most reviews first, in the commonest spelling", () => {
    const rows = [
      { ...withGenres(9, []), genre: "Action", secondaryGenres: ["Horror"] },
      { ...withGenres(8, []), genre: "Shooter", secondaryGenres: ["horror"] },
      { ...withGenres(7, []), genre: "Puzzle", secondaryGenres: ["Horror"] },
      { ...withGenres(6, []), genre: "action" },
    ];
    expect(genreFilterOptions(rows)).toEqual([
      "Horror",
      "Action",
      "Puzzle",
      "Shooter",
    ]);
  });

  it("counts a review once when its fallback heading is also a secondary genre", () => {
    const rows = [
      { ...withGenres(9, ["Puzzle"]), secondaryGenres: ["Puzzle"] },
      { ...withGenres(8, []), genre: "Action" },
    ];
    expect(genreFilterOptions(rows)).toEqual(["Action", "Puzzle"]);
  });
});
