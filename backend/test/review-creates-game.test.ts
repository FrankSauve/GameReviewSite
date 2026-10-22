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
import {
  ALICE,
  BOB,
  authedQuery,
  errorCodes,
  resetDatabase,
  startApp,
} from "./helpers.js";

/**
 * A game is written by the first review of it and never on its own, so the
 * library cannot hold a game nobody has reviewed.
 *
 * `fetch` is stubbed: these tests are about what gets written and whether RAWG
 * is asked at all, not about RAWG.
 */

const ELDEN_RING = {
  id: 1,
  name: "Elden Ring",
  released: "2022-02-25",
  background_image: "https://media.rawg.io/elden-ring.jpg",
  genres: [{ name: "RPG" }, { name: "Action" }],
  description_raw: "A game.",
};

interface FetchStub {
  calls: string[];
  restore: () => void;
}

function stubRawg(status = 200, body: object = ELDEN_RING): FetchStub {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const CREATE = `mutation Create($input: CreateReviewInput!) {
  createReview(input: $input) { id game { id title slug } }
}`;

const PREVIEW = `query Preview($rawgId: ID!) {
  rawgGame(rawgId: $rawgId) { rawgId title coverUrl genres releaseYear description game { id } }
}`;

const review = {
  rating: 9,
  content: "Played it.",
  yearPlayed: 2024,
  hoursPlayed: 80,
};

type Created = {
  createReview: { id: string; game: { id: string; title: string } };
};

describe("the first review of a game", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let rawg: FetchStub;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    process.env["RAWG_API_KEY"] = "test-key";
    rawg = stubRawg();
  });
  afterEach(() => {
    rawg.restore();
    delete process.env["RAWG_API_KEY"];
  });

  const write = (identity: typeof ALICE, input: Record<string, unknown>) =>
    authedQuery<Created>(app, CREATE, identity, {}, { input });

  it("creates the game from RAWG along with the review", async () => {
    const res = await write(ALICE, { ...review, rawgId: "1" });
    expect(res.errors).toBeUndefined();

    const game = await prisma.game.findUnique({
      where: { rawgId: "1" },
      include: { reviews: true, createdBy: true },
    });
    expect(game).toMatchObject({
      title: "Elden Ring",
      slug: "elden-ring",
      coverUrl: "https://media.rawg.io/elden-ring.jpg",
      genres: ["RPG", "Action"],
      releaseYear: 2022,
      description: "A game.",
    });
    expect(game?.createdBy?.username).toBe(ALICE.username);
    expect(game?.reviews.map((r) => r.id)).toEqual([res.data?.createReview.id]);
  });

  it("reviews the game already there, without asking RAWG", async () => {
    await write(ALICE, { ...review, rawgId: "1" });
    const before = rawg.calls.length;

    const res = await write(BOB, { ...review, rawgId: "1" });
    expect(res.errors).toBeUndefined();
    expect(rawg.calls).toHaveLength(before);
    expect(await prisma.game.count()).toBe(1);
    expect(await prisma.review.count()).toBe(2);
  });

  it("writes nothing when RAWG fails", async () => {
    rawg.restore();
    rawg = stubRawg(500);
    const res = await write(ALICE, { ...review, rawgId: "1" });
    expect(res.errors).toBeDefined();
    expect(await prisma.game.count()).toBe(0);
  });

  it("reports a RAWG id RAWG does not know as a missing game", async () => {
    rawg.restore();
    rawg = stubRawg(404, { detail: "Not found." });
    const res = await write(ALICE, { ...review, rawgId: "999999999" });
    expect(errorCodes(res)).toContain("NOT_FOUND");
    expect(res.errors?.[0]?.message).toBe("Game not found.");
    expect(await prisma.game.count()).toBe(0);
  });

  it("writes no game when the review itself is refused", async () => {
    const res = await write(ALICE, { ...review, rating: 11, rawgId: "1" });
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
    expect(await prisma.game.count()).toBe(0);
    expect(rawg.calls).toHaveLength(0);
  });

  it("asks for exactly one of gameId and rawgId", async () => {
    const game = await prisma.game.create({
      data: { title: "Hades", slug: "hades" },
    });
    for (const target of [{}, { gameId: game.id, rawgId: "1" }]) {
      const res = await write(ALICE, { ...review, ...target });
      expect(errorCodes(res)).toContain("BAD_USER_INPUT");
    }
    expect(await prisma.review.count()).toBe(0);
  });

  it("refuses a rawgId that is not an integer before calling RAWG", async () => {
    const res = await write(ALICE, { ...review, rawgId: "../../etc/passwd" });
    expect(res.errors?.[0]?.message).toMatch(
      /rawgId must be a positive integer/,
    );
    expect(rawg.calls).toHaveLength(0);
  });

  it("drops a cover that is not https", async () => {
    rawg.restore();
    rawg = stubRawg(200, {
      ...ELDEN_RING,
      background_image: "http://media.rawg.io/elden-ring.jpg",
    });
    await write(ALICE, { ...review, rawgId: "1" });
    const game = await prisma.game.findUnique({ where: { rawgId: "1" } });
    expect(game?.coverUrl).toBeNull();
  });
});

describe("previewing a game before its first review", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let rawg: FetchStub;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    process.env["RAWG_API_KEY"] = "test-key";
    rawg = stubRawg();
  });
  afterEach(() => {
    rawg.restore();
    delete process.env["RAWG_API_KEY"];
  });

  it("shows what RAWG has, and writes nothing", async () => {
    const res = await authedQuery<{
      rawgGame: { title: string; description: string; game: null };
    }>(app, PREVIEW, ALICE, {}, { rawgId: "1" });
    expect(res.errors).toBeUndefined();
    expect(res.data?.rawgGame).toMatchObject({
      title: "Elden Ring",
      description: "A game.",
      game: null,
    });
    expect(await prisma.game.count()).toBe(0);
  });

  it("is null for a RAWG id RAWG does not know", async () => {
    rawg.restore();
    rawg = stubRawg(404, { detail: "Not found." });
    const res = await authedQuery<{ rawgGame: null }>(
      app,
      PREVIEW,
      ALICE,
      {},
      { rawgId: "999999999" },
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.rawgGame).toBeNull();
  });

  it("points at the game when it is already in the library", async () => {
    const game = await prisma.game.create({
      data: { rawgId: "1", title: "Elden Ring", slug: "elden-ring" },
    });
    const res = await authedQuery<{ rawgGame: { game: { id: string } } }>(
      app,
      PREVIEW,
      ALICE,
      {},
      { rawgId: "1" },
    );
    expect(res.data?.rawgGame.game.id).toBe(game.id);
    expect(rawg.calls).toHaveLength(0);
  });
});
