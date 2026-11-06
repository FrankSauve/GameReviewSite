import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchSteamDlc, steamSource } from "../src/lib/gameSources/steam.js";

/** Trimmed from real responses, so the shapes here are Steam's, not a guess. */
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

describe("Steam as a game source", () => {
  beforeEach(() =>
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
  );
  afterEach(() => vi.restoreAllMocks());

  it("reads the app id out of the logo url, and drops a bundle", async () => {
    answer(fixture("steam-search"));
    const hits = await steamSource.search("hades");
    expect(hits[0]).toMatchObject({ externalId: "1145360", title: "Hades" });
    expect(hits.map((hit) => hit.title)).not.toContain(
      "Daedalic - Gigantic Bundle",
    );
  });

  it.each(["shared.fastly.steamstatic.com", "shared.akamai.steamstatic.com"])(
    "keeps a cover from %s as Steam returned it",
    async (host) => {
      const logo = `https://${host}/store_item_assets/steam/apps/1/a/b.jpg?t=1`;
      answer({ items: [{ name: "Hades", logo }] });
      expect((await steamSource.search("hades"))[0]?.coverUrl).toBe(logo);
    },
  );

  it.each(["steamstatic.com.example.com", "evilsteamstatic.com"])(
    "drops a cover from %s",
    async (host) => {
      const logo = `https://${host}/store_item_assets/steam/apps/1/a.jpg`;
      answer({ items: [{ name: "Hades", logo }] });
      expect((await steamSource.search("hades"))[0]?.coverUrl).toBeNull();
    },
  );

  it("stops at twelve when Steam sends more", async () => {
    const item = { name: "Game", logo: "https://x/steam/apps/1/a.jpg" };
    answer({ items: Array.from({ length: 20 }, () => item) });
    expect(await steamSource.search("game")).toHaveLength(12);
  });

  it("takes marks and entities off a title", async () => {
    answer({
      items: [
        {
          name: "Batman™: Tom &amp; Me®",
          logo: "https://x/steam/apps/1/a.jpg",
        },
      ],
    });
    expect((await steamSource.search("batman"))[0]?.title).toBe(
      "Batman: Tom & Me",
    );
  });

  it("searches games and DLC as separate categories", async () => {
    const stub = answer({ items: [] });
    await steamSource.search("x");
    await searchSteamDlc("x");
    expect(String(stub.mock.calls[0]?.[0])).toContain("category1=998");
    expect(String(stub.mock.calls[1]?.[0])).toContain("category1=21");
  });

  it("builds a game from its detail", async () => {
    answer(fixture("steam-app-game"));
    expect(await steamSource.detail("1145360")).toMatchObject({
      title: "Hades",
      releaseYear: 2020,
      genres: ["Action", "Indie", "RPG"],
      coverUrl: expect.stringMatching(
        /^https:\/\/shared\.[a-z]+\.steamstatic\.com\/.*header\.jpg/,
      ),
    });
  });

  it("accepts DLC, which a reviewer can review", async () => {
    answer(fixture("steam-app-dlc"));
    expect((await steamSource.detail("2138330"))?.title).toBe(
      "Cyberpunk 2077: Phantom Liberty",
    );
  });

  it("refuses an app that is not a game", async () => {
    answer({ "1": { success: true, data: { type: "music", name: "OST" } } });
    expect(await steamSource.detail("1")).toBeNull();
  });

  it("has nothing for an app Steam does not know", async () => {
    answer({ "1": { success: false } });
    expect(await steamSource.detail("1")).toBeNull();
  });

  it.each([
    ["null", null],
    ["no entry", {}],
    ["no data", { "1": { success: true } }],
  ])(
    "calls a shapeless detail (%s) an outage, not a missing game",
    async (_name, body) => {
      answer(body);
      await expect(steamSource.detail("1")).rejects.toThrow(
        "Steam is unavailable",
      );
    },
  );

  it("leaves out labels that are not genres", async () => {
    answer({
      "1": {
        success: true,
        data: {
          type: "game",
          name: "Free Game",
          genres: [{ description: "Free To Play" }, { description: "Action" }],
        },
      },
    });
    expect((await steamSource.detail("1"))?.genres).toEqual(["Action"]);
  });
});
