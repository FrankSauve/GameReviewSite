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
import { gameSearch } from "../src/lib/gameSources/index.js";
import { prisma } from "../src/lib/prisma.js";
import {
  ALICE,
  BOB,
  authedQuery,
  publicQuery,
  errorCodes,
  resetDatabase,
  startApp,
} from "./helpers.js";

/**
 * A game is written by the first review of it and never on its own, so the
 * library cannot hold a game nobody has reviewed.
 *
 * `fetch` is stubbed: these tests are about what gets written and whether a
 * source is asked at all, not about Steam.
 */

const ELDEN_RING = {
  type: "game",
  name: "Elden Ring",
  release_date: { date: "25 Feb, 2022" },
  header_image: "https://shared.akamai.steamstatic.com/elden-ring.jpg",
  genres: [{ description: "RPG" }, { description: "Action" }],
  short_description: "A game.",
};

interface FetchStub {
  calls: string[];
  restore: () => void;
}

/** Answers Steam's app details with `app`, or `success: false` when null. */
function stubSteam(status = 200, app: object | null = ELDEN_RING): FetchStub {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    const body = url.pathname.includes("IStoreBrowseService")
      ? { response: { store_items: [] } }
      : {
          [url.searchParams.get("appids") ?? ""]: app
            ? { success: true, data: app }
            : { success: false },
        };
    return new Response(JSON.stringify(body), {
      status: url.pathname.includes("appdetails") ? status : 200,
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

const PREVIEW = `query Preview($id: ID!) {
  externalGame(source: STEAM, id: $id) { externalId title coverUrl genres releaseYear description game { id } }
}`;

const REVIEW = {
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
  let steam: FetchStub;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    gameSearch.clear();
    steam = stubSteam();
  });
  afterEach(() => {
    steam.restore();
  });

  const write = (identity: typeof ALICE, input: Record<string, unknown>) =>
    authedQuery<Created>(app, CREATE, identity, {}, { input });

  it("creates the game from Steam along with the review", async () => {
    const res = await write(ALICE, {
      ...REVIEW,
      source: "STEAM",
      externalId: "1",
    });
    expect(res.errors).toBeUndefined();

    const game = await prisma.game.findUnique({
      where: { steamAppId: "1" },
      include: { reviews: true, createdBy: true },
    });
    expect(game).toMatchObject({
      title: "Elden Ring",
      slug: "elden-ring",
      coverUrl: "https://shared.akamai.steamstatic.com/elden-ring.jpg",
      genres: ["RPG", "Action"],
      releaseYear: 2022,
      description: "A game.",
    });
    expect(game?.createdBy?.username).toBe(ALICE.username);
    expect(game?.reviews.map((r) => r.id)).toEqual([res.data?.createReview.id]);
  });

  it("reviews the game already there, without asking Steam", async () => {
    await write(ALICE, { ...REVIEW, source: "STEAM", externalId: "1" });
    const before = steam.calls.length;

    const res = await write(BOB, {
      ...REVIEW,
      source: "STEAM",
      externalId: "1",
    });
    expect(res.errors).toBeUndefined();
    expect(steam.calls).toHaveLength(before);
    expect(await prisma.game.count()).toBe(1);
    expect(await prisma.review.count()).toBe(2);
  });

  it("writes nothing when Steam fails", async () => {
    steam.restore();
    steam = stubSteam(500);
    const res = await write(ALICE, {
      ...REVIEW,
      source: "STEAM",
      externalId: "1",
    });
    expect(res.errors).toBeDefined();
    expect(await prisma.game.count()).toBe(0);
  });

  it("reports an app Steam does not know as a missing game", async () => {
    steam.restore();
    steam = stubSteam(200, null);
    const res = await write(ALICE, {
      ...REVIEW,
      source: "STEAM",
      externalId: "999999999",
    });
    expect(errorCodes(res)).toContain("NOT_FOUND");
    expect(res.errors?.[0]?.message).toBe("Game not found.");
    expect(await prisma.game.count()).toBe(0);
  });

  it("writes no game when the review itself is refused", async () => {
    const res = await write(ALICE, {
      ...REVIEW,
      rating: 11,
      source: "STEAM",
      externalId: "1",
    });
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
    expect(await prisma.game.count()).toBe(0);
    expect(steam.calls).toHaveLength(0);
  });

  it("asks for exactly one of gameId and a source id", async () => {
    const game = await prisma.game.create({
      data: { title: "Hades", slug: "hades" },
    });
    for (const target of [
      {},
      { source: "STEAM" },
      { externalId: "1" },
      { gameId: game.id, source: "STEAM", externalId: "1" },
      { gameId: game.id, source: "STEAM" },
      { gameId: game.id, externalId: "1" },
    ]) {
      const res = await write(ALICE, { ...REVIEW, ...target });
      expect(errorCodes(res)).toContain("BAD_USER_INPUT");
    }
    expect(await prisma.review.count()).toBe(0);
  });

  it("previews a game for signed-in readers only", async () => {
    const res = await publicQuery(app, PREVIEW, {}, { id: "1" });
    expect(errorCodes(res)).toEqual(["UNAUTHENTICATED"]);
    expect(steam.calls).toHaveLength(0);
  });

  it("offers a same-titled library game for the reader to confirm", async () => {
    await prisma.game.create({
      data: {
        steamAppId: "7",
        title: "ELDEN RING",
        slug: "elden-ring",
        releaseYear: 2022,
      },
    });
    const res = await authedQuery<{
      externalGame: { game: null; libraryMatch: { slug: string } };
    }>(
      app,
      `{ externalGame(source: STEAM, id: "1") { game { id } libraryMatch { slug } } }`,
      ALICE,
    );
    expect(res.data?.externalGame.game).toBeNull();
    expect(res.data?.externalGame.libraryMatch.slug).toBe("elden-ring");
  });

  it("refuses a leading zero, which would be a second row for one id", async () => {
    const res = await write(ALICE, {
      ...REVIEW,
      source: "STEAM",
      externalId: "01",
    });
    expect(res.errors?.[0]?.message).toMatch(
      /externalId must be a positive integer/,
    );
    expect(steam.calls).toHaveLength(0);
  });

  it("refuses a source id that is not an integer before calling a source", async () => {
    const res = await write(ALICE, {
      ...REVIEW,
      source: "STEAM",
      externalId: "../../etc/passwd",
    });
    expect(res.errors?.[0]?.message).toMatch(
      /externalId must be a positive integer/,
    );
    expect(steam.calls).toHaveLength(0);
  });

  it("drops a cover that is not https", async () => {
    steam.restore();
    steam = stubSteam(200, {
      ...ELDEN_RING,
      header_image: "http://shared.akamai.steamstatic.com/elden-ring.jpg",
    });
    await write(ALICE, { ...REVIEW, source: "STEAM", externalId: "1" });
    const game = await prisma.game.findUnique({ where: { steamAppId: "1" } });
    expect(game?.coverUrl).toBeNull();
  });
});

describe("previewing a game before its first review", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let steam: FetchStub;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    gameSearch.clear();
    steam = stubSteam();
  });
  afterEach(() => {
    steam.restore();
  });

  it("shows what Steam has, and writes nothing", async () => {
    const res = await authedQuery<{
      externalGame: { title: string; description: string; game: null };
    }>(app, PREVIEW, ALICE, {}, { id: "1" });
    expect(res.errors).toBeUndefined();
    expect(res.data?.externalGame).toMatchObject({
      title: "Elden Ring",
      description: "A game.",
      game: null,
    });
    expect(await prisma.game.count()).toBe(0);
  });

  it("is null for an app Steam does not know", async () => {
    steam.restore();
    steam = stubSteam(200, null);
    const res = await authedQuery<{ externalGame: null }>(
      app,
      PREVIEW,
      ALICE,
      {},
      { id: "999999999" },
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.externalGame).toBeNull();
  });

  it("points at the game when it is already in the library", async () => {
    const game = await prisma.game.create({
      data: { steamAppId: "1", title: "Elden Ring", slug: "elden-ring" },
    });
    const res = await authedQuery<{ externalGame: { game: { id: string } } }>(
      app,
      PREVIEW,
      ALICE,
      {},
      { id: "1" },
    );
    expect(res.data?.externalGame.game.id).toBe(game.id);
    expect(steam.calls).toHaveLength(0);
  });
});

describe("a link from when RAWG was a source", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let steam: FetchStub;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    gameSearch.clear();
    steam = stubSteam();
  });
  afterEach(() => {
    steam.restore();
  });

  const RAWG_PREVIEW = `{ externalGame(source: RAWG, id: "1") { game { id } } }`;

  it("still reaches the game stored under that id, asking nobody", async () => {
    const game = await prisma.game.create({
      data: { rawgId: "1", title: "Elden Ring", slug: "elden-ring" },
    });
    const res = await authedQuery<{ externalGame: { game: { id: string } } }>(
      app,
      RAWG_PREVIEW,
      ALICE,
    );
    expect(res.data?.externalGame.game.id).toBe(game.id);

    const review = await authedQuery<Created>(
      app,
      CREATE,
      BOB,
      {},
      {
        input: { ...REVIEW, source: "RAWG", externalId: "1" },
      },
    );
    expect(review.data?.createReview.game.id).toBe(game.id);
    expect(steam.calls).toHaveLength(0);
  });

  it("finds nothing for an id the library never stored", async () => {
    const res = await authedQuery<{ externalGame: null }>(
      app,
      RAWG_PREVIEW,
      ALICE,
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.externalGame).toBeNull();
    expect(steam.calls).toHaveLength(0);
  });
});
