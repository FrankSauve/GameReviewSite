import { describe, expect, it } from "vitest";
import { coverUrl, gameFields } from "../src/lib/gameSources/fields.js";
import type { GameFields } from "../src/lib/gameSources/types.js";

const base: GameFields = {
  title: "Elden Ring",
  coverUrl: null,
  posterUrl: null,
  bannerUrl: null,
  genres: [],
  releaseYear: null,
  description: null,
};

describe("the game a first review builds from a source", () => {
  it("caps an over-long title rather than refusing it", () => {
    expect(
      gameFields({ ...base, title: "T".repeat(20_000) })?.title,
    ).toHaveLength(200);
  });

  it("has nothing to build from a blank title", () => {
    expect(gameFields({ ...base, title: "   " })).toBeNull();
  });

  /** Terraria lists more genres than a game carries; past the cap is dropped. */
  it("keeps the first five distinct genres", () => {
    const genres = ["A", "B", "A", "C", " ", "D", "E", "F"];
    expect(gameFields({ ...base, genres })?.genres).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  /** The same rule as an edit: "Indie" and "indie" are one genre. */
  it("folds genres that differ only in case", () => {
    const genres = ["Indie", "indie", "x".repeat(101)];
    expect(gameFields({ ...base, genres })?.genres).toEqual(["Indie"]);
  });

  it("leaves an empty description null", () => {
    expect(gameFields({ ...base, description: "  " })?.description).toBeNull();
  });
});

describe("a cover from a source", () => {
  const hosts = ["cdn.example.test"];

  it("is dropped on a host the CSP does not name", () => {
    expect(coverUrl("https://elsewhere.test/a.png", hosts)).toBeNull();
  });

  it("is kept only over https", () => {
    for (const cover of [
      "javascript:alert(document.domain)",
      "http://cdn.example.test/a.png",
      "data:image/png;base64,AAAA",
      "not a url",
    ])
      expect(coverUrl(cover, hosts), cover).toBeNull();
    expect(coverUrl("https://cdn.example.test/a.png", hosts)).toBe(
      "https://cdn.example.test/a.png",
    );
  });
});
