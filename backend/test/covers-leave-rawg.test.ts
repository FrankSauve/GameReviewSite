import { describe, expect, it } from "vitest";
import { coverSource, needsNewCover } from "../src/lib/coverRefresh.js";

const STEAM_COVER =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/header.jpg";
const TGDB_COVER = "https://cdn.thegamesdb.net/images/large/boxart/front/1.jpg";

const onSteam = (coverUrl: string | null) => ({
  coverUrl,
  steamAppId: "1145360",
  tgdbId: null,
});
const onTgdb = (coverUrl: string | null) => ({
  coverUrl,
  steamAppId: "1145360",
  tgdbId: "1",
});
const unsourced = (coverUrl: string | null) => ({
  coverUrl,
  steamAppId: null,
  tgdbId: null,
});

describe("which covers are replaced", () => {
  it("replaces a cover RAWG hosts, and a missing one", () => {
    expect(
      needsNewCover(onSteam("https://media.rawg.io/media/games/d89/x.jpg")),
    ).toBe(true);
    expect(needsNewCover(onSteam(null))).toBe(true);
    expect(needsNewCover(onSteam("not a url"))).toBe(true);
  });

  it("replaces a cover on any host the live sources do not serve from", () => {
    for (const url of [
      "https://api.rawg.io/media/x.jpg",
      "https://example.com/x.jpg",
      "https://steamstatic.com.example.com/x.jpg",
      "http://cdn.thegamesdb.net/images/large/boxart/front/1.jpg",
    ]) {
      expect(needsNewCover(onSteam(url))).toBe(true);
      expect(needsNewCover(unsourced(url))).toBe(true);
    }
  });

  it("leaves a cover that already comes from the game's source", () => {
    expect(needsNewCover(onSteam(STEAM_COVER))).toBe(false);
    expect(needsNewCover(onTgdb(TGDB_COVER))).toBe(false);
  });

  it("moves a Steam cover to TheGamesDB once the game has an id there", () => {
    expect(needsNewCover(onTgdb(STEAM_COVER))).toBe(true);
  });

  it("leaves either source's cover on a game with no id to look it up by", () => {
    expect(needsNewCover(unsourced(STEAM_COVER))).toBe(false);
    expect(needsNewCover(unsourced(TGDB_COVER))).toBe(false);
  });
});

describe("where a new cover comes from", () => {
  it("prefers TheGamesDB, held only without a Steam page or with re-release art", () => {
    expect(coverSource({ steamAppId: "1659040", tgdbId: "81637" })).toEqual({
      source: "TGDB",
      externalId: "81637",
    });
  });

  it("falls back to Steam", () => {
    expect(coverSource({ steamAppId: "1145360", tgdbId: null })).toEqual({
      source: "STEAM",
      externalId: "1145360",
    });
  });

  it("has nowhere to look for a game with neither id", () => {
    expect(coverSource({ steamAppId: null, tgdbId: null })).toBeNull();
  });
});
