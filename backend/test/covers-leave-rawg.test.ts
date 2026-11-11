import { describe, expect, it } from "vitest";
import { coverSource, needsNewCover } from "../src/lib/coverRefresh.js";

describe("which covers are replaced", () => {
  it("replaces a cover RAWG hosts, and a missing one", () => {
    expect(needsNewCover("https://media.rawg.io/media/games/d89/x.jpg")).toBe(
      true,
    );
    expect(needsNewCover(null)).toBe(true);
    expect(needsNewCover("not a url")).toBe(true);
  });

  it("replaces a cover on any host the live sources do not serve from", () => {
    expect(needsNewCover("https://api.rawg.io/media/x.jpg")).toBe(true);
    expect(needsNewCover("https://example.com/x.jpg")).toBe(true);
    expect(needsNewCover("https://steamstatic.com.example.com/x.jpg")).toBe(
      true,
    );
    expect(
      needsNewCover(
        "http://cdn.thegamesdb.net/images/large/boxart/front/1.jpg",
      ),
    ).toBe(true);
  });

  it("leaves a cover that already comes from Steam or TheGamesDB", () => {
    expect(
      needsNewCover(
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1145360/header.jpg",
      ),
    ).toBe(false);
    expect(
      needsNewCover(
        "https://cdn.thegamesdb.net/images/large/boxart/front/1.jpg",
      ),
    ).toBe(false);
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
