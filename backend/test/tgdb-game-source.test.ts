import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tgdbSource } from "../src/lib/gameSources/tgdb.js";

/** Trimmed from real responses, so the shapes here are TheGamesDB's, not a guess. */
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

const row = (id: number, game_title: string, extra: object = {}) => ({
  id,
  game_title,
  release_date: "2021-10-08",
  overview: "A game.",
  genres: [1],
  ...extra,
});

describe("TheGamesDB as a game source", () => {
  beforeEach(() => {
    process.env["TGDB_API_KEY"] = "secret-key";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env["TGDB_API_KEY"];
    vi.restoreAllMocks();
  });

  it("collapses one game's platforms, regions and editions to one row", async () => {
    answer(fixture("tgdb-search"));
    const hits = await tgdbSource.search("metroid dread");
    expect(hits.map((hit) => hit.title)).toEqual(["Metroid Dread"]);
    expect(hits[0]?.releaseYear).toBe(2021);
  });

  it("keeps same-titled games of different years apart", async () => {
    answer({
      data: {
        games: [
          row(1, "Doom", { release_date: "1993-12-10" }),
          row(2, "DOOM", { release_date: "2016-05-13" }),
        ],
      },
    });
    expect(await tgdbSource.search("doom")).toHaveLength(2);
  });

  it("offers the row with a front cover, whichever came first", async () => {
    answer({
      data: { games: [row(1, "Game"), row(2, "Game")] },
      include: {
        boxart: {
          base_url: { thumb: "https://cdn.thegamesdb.net/images/thumb/" },
          data: {
            "1": [{ side: "back", filename: "boxart/back/1-1.jpg" }],
            "2": [{ side: "front", filename: "boxart/front/2-1.jpg" }],
          },
        },
      },
    });
    expect((await tgdbSource.search("game"))[0]).toMatchObject({
      externalId: "2",
      coverUrl: "https://cdn.thegamesdb.net/images/thumb/boxart/front/2-1.jpg",
    });
  });

  it("leaves out ROM hacks and demos", async () => {
    answer({
      data: {
        games: [
          row(1, "Pokemon Hack", { genres: [4, 28] }),
          row(2, "A Demo", { genres: [30] }),
          row(3, "Real Game"),
        ],
      },
    });
    expect((await tgdbSource.search("x")).map((hit) => hit.title)).toEqual([
      "Real Game",
    ]);
  });

  it("treats a 1970 release date as unknown", async () => {
    answer({
      data: { games: [row(1, "Game", { release_date: "1970-01-01" })] },
    });
    expect((await tgdbSource.search("game"))[0]?.releaseYear).toBeNull();
  });

  it("spells genres the way RAWG does, and drops the ones that are not", async () => {
    answer({
      data: { games: [row(1, "Game", { genres: [4, 15, 3, 9, 27] })] },
    });
    expect((await tgdbSource.detail("1"))?.genres).toEqual([
      "RPG",
      "Platformer",
      "Simulation",
    ]);
  });

  it("builds a game from its detail, with the large cover", async () => {
    answer(fixture("tgdb-game"));
    expect(await tgdbSource.detail("87675")).toMatchObject({
      title: "Metroid Dread",
      releaseYear: 2021,
      genres: ["Action", "Adventure"],
      coverUrl:
        "https://cdn.thegamesdb.net/images/large/boxart/front/87675-1.jpg",
    });
  });

  it("answers an unknown id with an empty 200, which means no game", async () => {
    answer({ data: { count: 0, games: [] } });
    expect(await tgdbSource.detail("999999999")).toBeNull();
  });

  it("is off without a key", () => {
    delete process.env["TGDB_API_KEY"];
    expect(tgdbSource.enabled?.()).toBe(false);
  });

  it("stops being offered once the allowance runs low, until it refreshes", async () => {
    vi.useFakeTimers();
    answer({
      data: { games: [] },
      remaining_monthly_allowance: 49,
      allowance_refresh_timer: 60,
    });
    await tgdbSource.search("x");
    expect(tgdbSource.enabled?.()).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(tgdbSource.enabled?.()).toBe(true);
    vi.useRealTimers();
  });
});
