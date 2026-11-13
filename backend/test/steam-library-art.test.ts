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
import { artMissed } from "../src/lib/gameSources/art.js";
import { steamArt, steamSource } from "../src/lib/gameSources/steam.js";
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
    expect((await steamArt(["256290"])).get("256290")?.bannerUrl).toBeNull();
  });

  it("has no poster where Steam only letterboxed the header into one", async () => {
    answer(fixture("steam-items"));
    expect((await steamArt(["256290"])).get("256290")?.posterUrl).toBeNull();
  });

  it("asks for every app in one call", async () => {
    const fetch = answer(fixture("steam-items"));
    await steamArt(["2183900", "2062430", "256290"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not stop a game being added when the art lookup is down", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).includes("appdetails")
        ? new Response(JSON.stringify(fixture("steam-app-game")))
        : new Response("", { status: 503 }),
    );
    const fields = await steamSource.detail("1145360");
    expect(fields).toMatchObject({
      title: "Hades",
      posterUrl: null,
      bannerUrl: null,
    });
    // So the detail cache does not keep the game without art.
    expect(fields && artMissed(fields)).toBe(true);
  });

  it("marks nothing missed when the art lookup answered", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            fixture(
              String(url).includes("appdetails")
                ? "steam-app-game"
                : "steam-items",
            ),
          ),
        ),
    );
    const fields = await steamSource.detail("1145360");
    expect(fields && artMissed(fields)).toBe(false);
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
