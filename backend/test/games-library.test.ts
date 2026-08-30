import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import {
  ALICE,
  publicQuery,
  resetDatabase,
  sessionFor,
  startApp,
} from "./helpers.js";

const LIST = `query List($limit: Int, $offset: Int, $reviewedOnly: Boolean,
                         $genre: String, $platform: String, $reviewedBy: ID,
                         $sort: GameSort) {
  games(limit: $limit, offset: $offset, reviewedOnly: $reviewedOnly,
        genre: $genre, platform: $platform, reviewedBy: $reviewedBy,
        sort: $sort) { title }
  gamesCount(reviewedOnly: $reviewedOnly, genre: $genre,
             platform: $platform, reviewedBy: $reviewedBy)
}`;

const FACETS = `query { gameFacets { genres platforms } }`;

interface ListPayload {
  games: { title: string }[];
  gamesCount: number;
}

interface FacetPayload {
  gameFacets: { genres: string[]; platforms: string[] };
}

/** Games created at one instant, as a bulk import produces. */
async function seedBatch(titles: string[], createdAt: Date): Promise<void> {
  for (const title of titles) {
    await prisma.game.create({
      data: { title, slug: slugify(title, "game"), createdAt },
    });
  }
}

async function reviewGame(title: string): Promise<void> {
  await sessionFor(ALICE);
  const [user, game] = await Promise.all([
    prisma.user.findFirstOrThrow(),
    prisma.game.findFirstOrThrow({ where: { title } }),
  ]);
  await prisma.review.create({
    data: {
      rating: 8,
      content: "Played it.",
      yearPlayed: 2024,
      hoursPlayed: 12,
      slug: `${user.username}/${game.slug}`,
      gameId: game.id,
      userId: user.id,
    },
  });
}

describe("the games listing", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  describe("paging", () => {
    it("returns the window asked for", async () => {
      await seedBatch(["A", "B", "C", "D", "E"], new Date("2026-01-01"));
      const res = await publicQuery<ListPayload>(app, LIST, {}, {
        limit: 2,
        offset: 2,
      });
      expect(res.errors).toBeUndefined();
      expect(res.data?.games).toHaveLength(2);
    });

    it("counts the whole catalogue, not the page", async () => {
      await seedBatch(["A", "B", "C", "D", "E"], new Date("2026-01-01"));
      const res = await publicQuery<ListPayload>(app, LIST, {}, { limit: 2 });
      expect(res.data?.gamesCount).toBe(5);
    });

    /**
     * Thirty rows, not twelve: at twelve Postgres sorts the whole table on every
     * page and the ties come back in the same order, so the test passes with the
     * tiebreaker removed. Fifteen is enough to diverge.
     */
    it("shows each game exactly once across pages of a same-instant import", async () => {
      const titles = Array.from({ length: 30 }, (_, i) => `Game ${i + 1}`);
      await seedBatch(titles, new Date("2026-01-01T00:00:00.000Z"));

      const seen: string[] = [];
      for (let page = 0; page < 10; page++) {
        const res = await publicQuery<ListPayload>(app, LIST, {}, {
          limit: 3,
          offset: page * 3,
        });
        seen.push(...(res.data?.games ?? []).map((g) => g.title));
      }

      expect(seen).toHaveLength(30);
      expect([...new Set(seen)].sort()).toEqual([...titles].sort());
    });

    /**
     * The columns are nullable with no default, so a game added without labels
     * holds NULL rather than an empty array. Prisma coerces that to `[]` on
     * read; SQL does not, and the schema declares both lists non-nullable.
     */
    it("serves a game whose labels were never set", async () => {
      await prisma.game.create({ data: { title: "Bare", slug: "bare" } });
      const res = await publicQuery<{ games: { genres: string[]; platforms: string[] }[] }>(
        app,
        `{ games { genres platforms } }`,
        {}
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.games[0]).toEqual({ genres: [], platforms: [] });
    });

    it("returns an empty page past the end rather than erroring", async () => {
      await seedBatch(["A"], new Date("2026-01-01"));
      const res = await publicQuery<ListPayload>(app, LIST, {}, {
        limit: 10,
        offset: 100,
      });
      expect(res.errors).toBeUndefined();
      expect(res.data?.games).toEqual([]);
      // The total still describes the library, so the client can recover.
      expect(res.data?.gamesCount).toBe(1);
    });
  });

  describe("the reviewedOnly filter", () => {
    beforeEach(async () => {
      await seedBatch(["Reviewed", "Untouched"], new Date("2026-01-01"));
      await reviewGame("Reviewed");
    });

    it("drops games nobody has reviewed", async () => {
      const res = await publicQuery<ListPayload>(app, LIST, {}, {
        reviewedOnly: true,
      });
      expect(res.data?.games.map((g) => g.title)).toEqual(["Reviewed"]);
    });

    it("returns the whole catalogue when it is not asked for", async () => {
      const res = await publicQuery<ListPayload>(app, LIST, {});
      expect(res.data?.games).toHaveLength(2);
    });

    it("counts what the same filter would list", async () => {
      const res = await publicQuery<ListPayload>(app, LIST, {}, {
        reviewedOnly: true,
      });
      expect(res.data?.gamesCount).toBe(1);
    });
  });


  describe("sorting", () => {
    /**
     * Titles, years and ratings all differ, so a sort that silently fell back to
     * the default would reorder these rather than happening to agree with it.
     */
    beforeEach(async () => {
      const bob = await prisma.user.create({
        data: { authentikUid: "b", username: "bob", email: "b@e.com", slug: "bob" },
      });
      const seed = [
        // title, year, genre, platform, ratings, hours
        ["Zelda", 2017, "Action", "Switch", [10], [120]],
        ["doom", 1994, "FPS", "PC", [8, 6], [5, 5]],
        ["Myst", 1993, "Puzzle", "PC", [9], [null]],
        ["Unplayed", null, "FPS", "PC", [], []],
      ] as const;
      for (const [title, year, genre, platform, ratings, hours] of seed) {
        const game = await prisma.game.create({
          data: {
            title,
            slug: slugify(title, "game"),
            releaseYear: year,
            genres: [genre],
            platforms: [platform],
          },
        });
        for (const [i, rating] of ratings.entries()) {
          await prisma.review.create({
            data: {
              rating,
              content: "Played it.",
              hoursPlayed: hours[i],
              slug: `${game.slug}-${i}`,
              gameId: game.id,
              userId: bob.id,
            },
          });
        }
      }
    });

    const order = async (app: Express, sort: string) => {
      const res = await publicQuery<ListPayload>(app, LIST, {}, { sort });
      expect(res.errors).toBeUndefined();
      return res.data?.games.map((g) => g.title);
    };

    it("orders by title without regard to case", async () => {
      // "doom" belongs at the front, not after "Zelda" where a raw byte sort
      // would put a lowercase initial.
      expect(await order(app, "TITLE")).toEqual(["doom", "Myst", "Unplayed", "Zelda"]);
    });

    it("orders by release year, newest first", async () => {
      expect(await order(app, "RELEASE_YEAR")).toEqual(["Zelda", "doom", "Myst", "Unplayed"]);
    });

    it("orders by review count", async () => {
      expect((await order(app, "MOST_REVIEWED"))?.[0]).toBe("doom");
    });

    it("orders by average rating, not by rating total", async () => {
      // doom has the most reviews and the lowest average; it must not lead.
      expect(await order(app, "HIGHEST_RATED")).toEqual(["Zelda", "Myst", "doom", "Unplayed"]);
    });

    it("orders by hours played", async () => {
      expect((await order(app, "MOST_PLAYED"))?.slice(0, 2)).toEqual(["Zelda", "doom"]);
    });

    /** A game nobody has rated sorts to the end, which is not where DESC puts NULL. */
    it("puts unrated games last rather than first", async () => {
      for (const sort of ["HIGHEST_RATED", "RELEASE_YEAR"]) {
        expect((await order(app, sort))?.at(-1)).toBe("Unplayed");
      }
    });

    /**
     * Myst has a review that left the hours blank, so its total is NULL just as
     * an unreviewed game's is. Under MOST_PLAYED the two are indistinguishable
     * and the id tiebreaker separates them; both belong behind the games that
     * recorded hours.
     */
    it("sorts a review with no hours recorded alongside no review at all", async () => {
      expect((await order(app, "MOST_PLAYED"))?.slice(2).sort()).toEqual([
        "Myst",
        "Unplayed",
      ]);
    });

    it("refuses a sort that is not in the enum", async () => {
      const res = await publicQuery<ListPayload>(app, LIST, {}, { sort: "DROP TABLE" });
      expect(res.errors?.[0].message).toMatch(/GameSort/);
    });
  });

  describe("filtering", () => {
    beforeEach(async () => {
      const [alice, bob] = await Promise.all([
        prisma.user.create({
          data: { authentikUid: "a", username: "alice", email: "a@e.com", slug: "alice" },
        }),
        prisma.user.create({
          data: { authentikUid: "b", username: "bob", email: "b@e.com", slug: "bob" },
        }),
      ]);
      const shooter = await prisma.game.create({
        data: { title: "Shooter", slug: "shooter", genres: ["FPS"], platforms: ["PC"] },
      });
      const puzzler = await prisma.game.create({
        data: { title: "Puzzler", slug: "puzzler", genres: ["Puzzle"], platforms: ["Switch"] },
      });
      await prisma.game.create({
        data: { title: "Untouched", slug: "untouched", genres: ["FPS"], platforms: ["PC"] },
      });
      await prisma.review.create({
        data: { rating: 7, content: "c", slug: "r-a", gameId: shooter.id, userId: alice.id },
      });
      await prisma.review.create({
        data: { rating: 7, content: "c", slug: "r-b", gameId: puzzler.id, userId: bob.id },
      });
    });

    const titles = async (vars: Record<string, unknown>) => {
      const res = await publicQuery<ListPayload>(app, LIST, {}, vars);
      expect(res.errors).toBeUndefined();
      return { titles: res.data?.games.map((g) => g.title).sort(), count: res.data?.gamesCount };
    };

    it("filters by genre", async () => {
      expect(await titles({ genre: "FPS" })).toEqual({
        titles: ["Shooter", "Untouched"],
        count: 2,
      });
    });

    it("filters by platform", async () => {
      expect(await titles({ platform: "Switch" })).toEqual({ titles: ["Puzzler"], count: 1 });
    });

    it("filters by the user who reviewed, by slug or by id", async () => {
      expect(await titles({ reviewedBy: "alice" })).toEqual({ titles: ["Shooter"], count: 1 });
      const alice = await prisma.user.findFirstOrThrow({ where: { username: "alice" } });
      expect(await titles({ reviewedBy: alice.id })).toEqual({ titles: ["Shooter"], count: 1 });
    });

    it("combines filters rather than picking one", async () => {
      expect(await titles({ genre: "FPS", reviewedOnly: true })).toEqual({
        titles: ["Shooter"],
        count: 1,
      });
    });

    /** The filter values are parameters, not string-pasted SQL. */
    it("treats a filter value that looks like SQL as a value", async () => {
      expect(await titles({ genre: "' OR 1=1 --" })).toEqual({ titles: [], count: 0 });
    });

    it("lists the distinct labels in the catalogue for the menus", async () => {
      const res = await publicQuery<FacetPayload>(app, FACETS, {});
      expect(res.data?.gameFacets.genres).toEqual(["FPS", "Puzzle"]);
      expect(res.data?.gameFacets.platforms).toEqual(["PC", "Switch"]);
    });
  });
});
