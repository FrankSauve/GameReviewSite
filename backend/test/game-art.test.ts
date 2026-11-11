import { readFileSync } from "node:fs";
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
import { steamArt, steamSource } from "../src/lib/gameSources/steam.js";
import { tgdbFanart } from "../src/lib/gameSources/tgdb.js";
import { prisma } from "../src/lib/prisma.js";
import { publicQuery, resetDatabase, startApp } from "./helpers.js";

/** Trimmed from real responses, so the shapes here are the sources', not a guess. */
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/gameSources/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

const answer = (body: unknown) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => new Response(JSON.stringify(body)));

const ASSETS =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

describe("Steam's library art", () => {
  beforeEach(() =>
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
  );
  afterEach(() => vi.restoreAllMocks());

  it("is where Steam says, hashed path or not", async () => {
    answer(fixture("steam-items"));
    const art = await steamArt(["2183900", "2062430"]);
    expect(art.get("2183900")).toEqual({
      posterUrl: `${ASSETS}/2183900/library_600x900.jpg?t=1790874369`,
      bannerUrl: `${ASSETS}/2183900/library_hero.jpg?t=1790874369`,
    });
    expect(art.get("2062430")?.posterUrl).toBe(
      `${ASSETS}/2062430/b6cabe1940c55119820eee4ed2d0b604bd5b3af4/library_600x900.jpg?t=1790869056`,
    );
  });

  it("has no banner for an app with no hero, rather than a guess that 404s", async () => {
    answer(fixture("steam-items"));
    expect((await steamArt(["256290"])).get("256290")).toEqual({
      posterUrl: `${ASSETS}/256290/portrait.png?t=1777993974`,
      bannerUrl: null,
    });
  });

  it("asks for every app in one call", async () => {
    const fetch = answer(fixture("steam-items"));
    await steamArt(["2183900", "2062430", "256290"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not stop a game being added when the art cannot be had", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("appdetails")
        ? new Response(JSON.stringify(fixture("steam-app-game")))
        : new Response("", { status: 503 }),
    );
    expect(await steamSource.detail("1145360")).toMatchObject({
      title: "Hades",
      posterUrl: null,
      bannerUrl: null,
    });
  });
});

describe("TheGamesDB's fan art", () => {
  beforeEach(() => {
    vi.stubEnv("TGDB_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is the first fan art uploaded, and none where there is none", async () => {
    answer(fixture("tgdb-images"));
    const fanart = await tgdbFanart(["70", "7752", "29221"]);
    expect(fanart.get("70")).toBe(
      "https://cdn.thegamesdb.net/images/large/fanart/70-1.jpg",
    );
    expect(fanart.get("7752")).toBe(
      "https://cdn.thegamesdb.net/images/large/fanart/7752-1.jpg",
    );
    expect(fanart.has("29221")).toBe(false);
  });
});

describe("a game's art in the API", () => {
  let app: Express;
  let stop: () => Promise<void>;
  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("is what was stored with the game", async () => {
    const game = await prisma.game.create({
      data: {
        title: "S",
        slug: "s",
        posterUrl: `${ASSETS}/1/library_600x900.jpg`,
        bannerUrl: null,
      },
    });
    const res = await publicQuery<{
      game: { posterUrl: string | null; bannerUrl: string | null };
    }>(
      app,
      `query G($id: ID!) { game(id: $id) { posterUrl bannerUrl } }`,
      {},
      {
        id: game.id,
      },
    );
    expect(res.data?.game).toEqual({
      posterUrl: `${ASSETS}/1/library_600x900.jpg`,
      bannerUrl: null,
    });
  });
});
