import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { escapeLike, searchableTitle } from "../src/lib/gameCatalogue.js";
import {
  ALICE,
  BOB,
  publicQuery,
  resetDatabase,
  seedGame,
  sessionFor,
  startApp,
} from "./helpers.js";

const SEARCH = `query Search($query: String!, $limit: Int) {
  searchGames(query: $query, limit: $limit) { slug title reviewCount }
}`;

const EXTERNAL = `query External($query: String!) {
  searchGamesExternal(query: $query) { rawgId title game { slug } }
}`;

interface Found {
  searchGames: { slug: string; title: string; reviewCount: number }[];
}

/** A game with one review, which is what makes it searchable. */
async function seedReviewed(title: string): Promise<string> {
  const id = await seedGame(title);
  await review(id);
  return id;
}

async function review(gameId: string, identity = ALICE): Promise<void> {
  await sessionFor(identity);
  const user = await prisma.user.findFirstOrThrow({
    where: { username: identity.username },
  });
  await prisma.review.create({
    data: {
      slug: `review-${gameId}-${identity.username}`,
      rating: 8,
      content: "Good.",
      userId: user.id,
      gameId,
    },
  });
}

describe("escapeLike", () => {
  it("escapes the LIKE metacharacters and leaves the rest alone", () => {
    expect(escapeLike("100% a_b\\c")).toBe("100\\% a\\_b\\\\c");
  });
});

describe("searchableTitle", () => {
  it("trims, and refuses a query too short or longer than any title", () => {
    expect(searchableTitle("  halo ")).toBe("halo");
    expect(searchableTitle(" x ")).toBeNull();
    expect(searchableTitle("a".repeat(200))).toHaveLength(200);
    expect(searchableTitle("a".repeat(201))).toBeNull();
  });
});

describe("searchGames", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  const search = (query: string, limit?: number) =>
    publicQuery<Found>(app, SEARCH, {}, { query, limit });

  it("matches a substring of the title, ignoring case", async () => {
    await seedReviewed("Hollow Knight");
    await seedReviewed("Celeste");
    const res = await search("low kn");
    expect(res.errors).toBeUndefined();
    expect(res.data?.searchGames.map((g) => g.title)).toEqual([
      "Hollow Knight",
    ]);
  });

  it("treats % and _ in the query literally", async () => {
    await seedReviewed("Hollow Knight");
    await seedReviewed("100% Orange Juice");
    const res = await search("0%");
    expect(res.data?.searchGames.map((g) => g.title)).toEqual([
      "100% Orange Juice",
    ]);
    expect((await search("__")).data?.searchGames).toEqual([]);
  });

  it("leaves out a game nobody has reviewed", async () => {
    await seedGame("HELLDIVERS 2");
    await seedReviewed("Helldivers II");
    const res = await search("helldivers");
    expect(res.data?.searchGames.map((g) => g.title)).toEqual([
      "Helldivers II",
    ]);
  });

  it("ranks the most-reviewed game first", async () => {
    await seedReviewed("Dark Souls");
    const popular = await seedReviewed("Dark Souls III");
    await review(popular, BOB);
    const res = await search("dark souls");
    expect(res.data?.searchGames).toEqual([
      expect.objectContaining({ title: "Dark Souls III", reviewCount: 2 }),
      expect.objectContaining({ title: "Dark Souls", reviewCount: 1 }),
    ]);
  });

  it("clamps the limit", async () => {
    for (let i = 0; i < 25; i++) await seedReviewed(`Game ${i}`);
    const res = await search("game", 1000);
    expect(res.data?.searchGames).toHaveLength(20);
  });

  it("returns nothing for a query under two characters", async () => {
    await seedReviewed("X");
    expect((await search(" x ")).data?.searchGames).toEqual([]);
  });

  it("returns nothing for a query longer than any title", async () => {
    await seedReviewed("Hollow Knight");
    const res = await search("Hollow Knight".padEnd(201, " x"));
    expect(res.errors).toBeUndefined();
    expect(res.data?.searchGames).toEqual([]);
  });
});

describe("searchGamesExternal", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let original: typeof globalThis.fetch;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    process.env["RAWG_API_KEY"] = "test-key";
    original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      const body = {
        results: [
          { id: 1, name: "Helldivers II" },
          { id: 2, name: "HELLDIVERS 2" },
        ],
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
    delete process.env["RAWG_API_KEY"];
  });

  it("links a result to the game already imported under its rawgId", async () => {
    await prisma.game.create({
      data: { rawgId: "1", title: "Helldivers II", slug: "helldivers-ii" },
    });
    const res = await publicQuery<{
      searchGamesExternal: { rawgId: string; game: { slug: string } | null }[];
    }>(app, EXTERNAL, {}, { query: "helldivers" });
    expect(res.errors).toBeUndefined();
    expect(res.data?.searchGamesExternal).toEqual([
      { rawgId: "1", title: "Helldivers II", game: { slug: "helldivers-ii" } },
      { rawgId: "2", title: "HELLDIVERS 2", game: null },
    ]);
  });
});
