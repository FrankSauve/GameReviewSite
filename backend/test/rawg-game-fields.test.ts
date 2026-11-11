import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameFieldsFromRawg, rawgSource } from "../src/lib/gameSources/rawg.js";

const base = { id: 1, name: "Elden Ring" };

describe("the game a first review builds from RAWG", () => {
  it("caps an over-long title rather than refusing it", () => {
    const fields = gameFieldsFromRawg({ ...base, name: "T".repeat(20_000) });
    expect(fields?.title).toHaveLength(200);
  });

  it("has nothing to build from a blank title", () => {
    expect(gameFieldsFromRawg({ ...base, name: "   " })).toBeNull();
  });

  it("drops a cover on a host the CSP does not name", () => {
    expect(
      gameFieldsFromRawg({
        ...base,
        background_image: "https://example.com/a.png",
      })?.coverUrl,
    ).toBeNull();
  });

  it("keeps only an https cover", () => {
    for (const cover of [
      "javascript:alert(document.domain)",
      "http://example.com/a.png",
      "data:image/png;base64,AAAA",
      "not a url",
    ]) {
      expect(
        gameFieldsFromRawg({ ...base, background_image: cover })?.coverUrl,
        cover,
      ).toBeNull();
    }
    expect(
      gameFieldsFromRawg({
        ...base,
        background_image: "https://media.rawg.io/media/games/a.jpg",
      })?.coverUrl,
    ).toBe("https://media.rawg.io/media/games/a.jpg");
  });

  /** Terraria lists more genres than a game carries; past the cap is dropped. */
  it("keeps the first five distinct genres", () => {
    const names = ["A", "B", "A", "C", " ", "D", "E", "F"];
    const fields = gameFieldsFromRawg({
      ...base,
      genres: names.map((name) => ({ name })),
    });
    expect(fields?.genres).toEqual(["A", "B", "C", "D", "E"]);
  });

  /** The same rule as an edit: "Indie" and "indie" are one genre. */
  it("folds genres that differ only in case", () => {
    const fields = gameFieldsFromRawg({
      ...base,
      genres: [{ name: "Indie" }, { name: "indie" }, { name: "x".repeat(101) }],
    });
    expect(fields?.genres).toEqual(["Indie"]);
  });

  it("reads the year from the release date and leaves an empty description null", () => {
    const fields = gameFieldsFromRawg({
      ...base,
      released: "2022-02-25",
      description_raw: "  ",
    });
    expect(fields?.releaseYear).toBe(2022);
    expect(fields?.description).toBeNull();
  });
});

describe("a shapeless answer from RAWG", () => {
  beforeEach(() => {
    process.env["RAWG_API_KEY"] = "test-key";
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("{}"),
    );
  });
  afterEach(() => {
    delete process.env["RAWG_API_KEY"];
    vi.restoreAllMocks();
  });

  it("is an outage in search, not no results", async () => {
    await expect(rawgSource.search("x")).rejects.toThrow("RAWG is unavailable");
  });

  it("is an outage in detail, not a crash", async () => {
    await expect(rawgSource.detail("1")).rejects.toThrow("RAWG is unavailable");
  });
});
