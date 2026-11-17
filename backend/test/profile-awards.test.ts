import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import {
  AWARD_NAME_MAX,
  AWARD_RANK_MAX,
  normalizeYearAwards,
} from "../src/lib/awards.js";
import {
  ALICE,
  BOB,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  seedGame,
  startApp,
  type Identity,
} from "./helpers.js";

interface YearAwardsPayload {
  id: string;
  year: number;
  ranking: { rank: number; game: { title: string } }[];
  categories: { name: string; game: { title: string } }[];
}

const AWARDS = `{ id year ranking { rank game { title } } categories { name game { title } } }`;

const SET = `mutation Set($input: SetYearAwardsInput!) {
  setYearAwards(input: $input) ${AWARDS}
}`;

interface AwardsInput {
  year: number;
  ranking?: string[];
  categories?: { name: string; gameId: string }[];
}

/** A game the identity reviewed as played in `year`. */
async function playedIn(
  app: Express,
  identity: Identity,
  title: string,
  year: number,
): Promise<string> {
  const gameId =
    (await prisma.game.findFirst({ where: { title } }))?.id ??
    (await seedGame(title));
  const res = await authedQuery(
    app,
    `mutation { createReview(input: { gameId: "${gameId}", rating: 8, content: "c", yearPlayed: ${year}, hoursPlayed: 10 }) { id } }`,
    identity,
  );
  expect(res.errors).toBeUndefined();
  return gameId;
}

function setAwards(
  app: Express,
  identity: Identity | undefined,
  { year, ranking = [], categories = [] }: AwardsInput,
) {
  return authedQuery<{ setYearAwards: YearAwardsPayload }>(
    app,
    SET,
    identity,
    {},
    { input: { year, ranking, categories } },
  );
}

async function readAwards(identity: Identity, year: number, app: Express) {
  const res = await publicQuery<{
    user: { awardYears: number[]; awards: YearAwardsPayload };
  }>(
    app,
    `query { user(id: "${identity.username}") { awardYears awards(year: ${year}) ${AWARDS} } }`,
  );
  expect(res.errors).toBeUndefined();
  if (!res.data) throw new Error("no data");
  return res.data.user;
}

describe("yearly awards", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("stores a ranking and named awards and shows them to anyone, in order", async () => {
    const elden = await playedIn(app, ALICE, "Elden Ring", 2024);
    const hades = await playedIn(app, ALICE, "Hades", 2024);
    const res = await setAwards(app, ALICE, {
      year: 2024,
      ranking: [hades, elden],
      categories: [
        { name: "Best Boss", gameId: elden },
        { name: "  Best Music ", gameId: hades },
      ],
    });
    expect(res.errors).toBeUndefined();

    const seen = await readAwards(ALICE, 2024, app);
    expect(seen.awards.ranking).toEqual([
      { rank: 1, game: { title: "Hades" } },
      { rank: 2, game: { title: "Elden Ring" } },
    ]);
    expect(seen.awards.categories).toEqual([
      { name: "Best Boss", game: { title: "Elden Ring" } },
      { name: "Best Music", game: { title: "Hades" } },
    ]);
    expect(seen.awards.id).toBe(res.data?.setYearAwards.id);
  });

  it("allows just a game of the year", async () => {
    const elden = await playedIn(app, ALICE, "Elden Ring", 2024);
    const res = await setAwards(app, ALICE, { year: 2024, ranking: [elden] });
    expect(res.errors).toBeUndefined();
    expect(res.data?.setYearAwards.ranking).toHaveLength(1);
  });

  it("refuses a game played in a different year", async () => {
    const elden = await playedIn(app, ALICE, "Elden Ring", 2023);
    const res = await setAwards(app, ALICE, { year: 2024, ranking: [elden] });
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
    expect(await prisma.awardRank.count()).toBe(0);
  });

  it("keeps a year saveable after an awarded game's review moves year", async () => {
    const elden = await playedIn(app, ALICE, "Elden Ring", 2024);
    const hades = await playedIn(app, ALICE, "Hades", 2024);
    await setAwards(app, ALICE, { year: 2024, ranking: [elden] });
    await prisma.review.updateMany({
      where: { gameId: elden },
      data: { yearPlayed: 2023 },
    });

    const res = await setAwards(app, ALICE, {
      year: 2024,
      ranking: [hades, elden],
    });
    expect(res.errors).toBeUndefined();
    expect(res.data?.setYearAwards.ranking.map((r) => r.game.title)).toEqual([
      "Hades",
      "Elden Ring",
    ]);
  });

  it("refuses a game only someone else played", async () => {
    const elden = await playedIn(app, BOB, "Elden Ring", 2024);
    const res = await setAwards(app, ALICE, {
      year: 2024,
      categories: [{ name: "Best Boss", gameId: elden }],
    });
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
  });

  it("refuses an anonymous write", async () => {
    const elden = await playedIn(app, ALICE, "Elden Ring", 2024);
    const res = await setAwards(app, undefined, {
      year: 2024,
      ranking: [elden],
    });
    expect(errorCodes(res)).toContain("UNAUTHENTICATED");
  });

  it("replaces the whole year, and an empty save clears it", async () => {
    const elden = await playedIn(app, ALICE, "Elden Ring", 2024);
    const hades = await playedIn(app, ALICE, "Hades", 2024);
    await setAwards(app, ALICE, {
      year: 2024,
      ranking: [elden, hades],
      categories: [{ name: "Best Boss", gameId: elden }],
    });

    const swapped = await setAwards(app, ALICE, {
      year: 2024,
      ranking: [hades, elden],
    });
    expect(swapped.errors).toBeUndefined();
    expect(
      swapped.data?.setYearAwards.ranking.map((r) => r.game.title),
    ).toEqual(["Hades", "Elden Ring"]);
    expect(swapped.data?.setYearAwards.categories).toEqual([]);

    await setAwards(app, ALICE, { year: 2024 });
    expect(await prisma.awardRank.count()).toBe(0);
    expect((await readAwards(ALICE, 2024, app)).awardYears).toEqual([]);
  });

  it("leaves other years and other accounts alone", async () => {
    const a2023 = await playedIn(app, ALICE, "Celeste", 2023);
    const a2024 = await playedIn(app, ALICE, "Elden Ring", 2024);
    const b2024 = await playedIn(app, BOB, "Hades", 2024);
    await setAwards(app, ALICE, { year: 2023, ranking: [a2023] });
    await setAwards(app, BOB, { year: 2024, ranking: [b2024] });
    await setAwards(app, ALICE, { year: 2024, ranking: [a2024] });
    await setAwards(app, ALICE, { year: 2024 });

    const alice = await readAwards(ALICE, 2023, app);
    expect(alice.awardYears).toEqual([2023]);
    expect(alice.awards.ranking[0]?.game.title).toBe("Celeste");
    expect((await readAwards(BOB, 2024, app)).awards.ranking).toHaveLength(1);
  });

  it("lists award years newest first", async () => {
    const a = await playedIn(app, ALICE, "Celeste", 2022);
    const b = await playedIn(app, ALICE, "Elden Ring", 2024);
    await setAwards(app, ALICE, { year: 2022, ranking: [a] });
    await setAwards(app, ALICE, {
      year: 2024,
      categories: [{ name: "Best Boss", gameId: b }],
    });
    expect((await readAwards(ALICE, 2024, app)).awardYears).toEqual([
      2024, 2022,
    ]);
  });

  /** Read through per-request loaders, so a list of accounts batches. */
  it("reads several accounts' awards in one query, each its own", async () => {
    const a = await playedIn(app, ALICE, "Elden Ring", 2024);
    const b = await playedIn(app, BOB, "Hades", 2024);
    await setAwards(app, ALICE, {
      year: 2024,
      ranking: [a],
      categories: [{ name: "Best Boss", gameId: a }],
    });
    await setAwards(app, BOB, { year: 2024, ranking: [b] });

    const res = await publicQuery<{
      users: {
        username: string;
        awardYears: number[];
        awards: YearAwardsPayload;
      }[];
    }>(
      app,
      `query { users(limit: 10) { username awardYears awards(year: 2024) ${AWARDS} } }`,
    );
    expect(res.errors).toBeUndefined();
    const byName = new Map(res.data?.users.map((u) => [u.username, u]));
    expect(byName.get(ALICE.username)?.awards.ranking[0]?.game.title).toBe(
      "Elden Ring",
    );
    expect(byName.get(ALICE.username)?.awards.categories).toHaveLength(1);
    expect(byName.get(BOB.username)?.awards.ranking[0]?.game.title).toBe(
      "Hades",
    );
    expect(byName.get(BOB.username)?.awards.categories).toEqual([]);
    expect(byName.get(BOB.username)?.awardYears).toEqual([2024]);
  });

  it("drops the award when the game is deleted", async () => {
    const elden = await playedIn(app, ALICE, "Elden Ring", 2024);
    await setAwards(app, ALICE, {
      year: 2024,
      ranking: [elden],
      categories: [{ name: "Best Boss", gameId: elden }],
    });
    await prisma.game.delete({ where: { id: elden } });
    expect(await prisma.awardRank.count()).toBe(0);
    expect(await prisma.awardCategory.count()).toBe(0);
  });

  it("refuses a year outside the review range when reading", async () => {
    await playedIn(app, ALICE, "Elden Ring", 2024);
    const res = await publicQuery(
      app,
      `query { user(id: "${ALICE.username}") { awards(year: 1900) { year } } }`,
    );
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
  });
});

describe("normalizeYearAwards", () => {
  const year = 2024;
  const ids = Array.from({ length: AWARD_RANK_MAX + 1 }, (_, i) => `g${i}`);

  it("numbers ranks from 1 and positions from 0", () => {
    expect(
      normalizeYearAwards({
        year,
        ranking: ["a", "b"],
        categories: [{ name: "X", gameId: "a" }],
      }),
    ).toEqual({
      year,
      ranks: [
        { rank: 1, gameId: "a" },
        { rank: 2, gameId: "b" },
      ],
      categories: [{ position: 0, name: "X", gameId: "a" }],
    });
  });

  it.each([
    ["too many ranks", { year, ranking: ids, categories: [] }],
    ["a repeated game", { year, ranking: ["a", "a"], categories: [] }],
    [
      "a blank name",
      { year, ranking: [], categories: [{ name: "  ", gameId: "a" }] },
    ],
    [
      "a long name",
      {
        year,
        ranking: [],
        categories: [{ name: "x".repeat(AWARD_NAME_MAX + 1), gameId: "a" }],
      },
    ],
    [
      "names equal ignoring case",
      {
        year,
        ranking: [],
        categories: [
          { name: "Best Boss", gameId: "a" },
          { name: "best boss ", gameId: "b" },
        ],
      },
    ],
    ["a bad year", { year: 1900, ranking: [], categories: [] }],
  ])("refuses %s", (_label, input) => {
    expect(() => normalizeYearAwards(input)).toThrow();
  });

  it("lets one game win several awards", () => {
    expect(
      normalizeYearAwards({
        year,
        ranking: ["a"],
        categories: [
          { name: "X", gameId: "a" },
          { name: "Y", gameId: "a" },
        ],
      }).categories,
    ).toHaveLength(2);
  });
});
