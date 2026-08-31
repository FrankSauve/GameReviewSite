import { describe, expect, it } from "vitest";
import { MAX_LABELS, mergeLabels } from "../src/lib/labels.js";

/**
 * The decision the genre backfill script makes per game. Games imported before
 * the multi-genre migration carry one genre; RAWG knows more, but a list someone
 * curated by hand must survive the run untouched.
 */
describe("merging RAWG genres into a stored list", () => {
  it("adds the genres RAWG knows to the one that was imported", () => {
    expect(mergeLabels(["Action"], ["Action", "RPG", "Adventure"])).toEqual([
      "Action",
      "RPG",
      "Adventure",
    ]);
  });

  it("fills an empty list", () => {
    expect(mergeLabels([], ["Indie", "Platformer"])).toEqual([
      "Indie",
      "Platformer",
    ]);
  });

  it("keeps the stored genres first", () => {
    expect(mergeLabels(["Roguelike"], ["Action", "Indie"])).toEqual([
      "Roguelike",
      "Action",
      "Indie",
    ]);
  });

  it("leaves a full list alone rather than reordering it", () => {
    const curated = ["Action", "RPG", "Indie", "Shooter", "Strategy"];
    expect(curated).toHaveLength(MAX_LABELS);
    expect(mergeLabels(curated, ["Puzzle", "Racing"])).toBeNull();
  });

  it("stops at the cap", () => {
    expect(mergeLabels(["Action"], ["A", "B", "C", "D", "E", "F"])).toEqual([
      "Action",
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("reports no change when RAWG adds nothing new", () => {
    expect(mergeLabels(["Action"], ["Action"])).toBeNull();
    expect(mergeLabels(["Action"], [])).toBeNull();
  });

  it("treats a differently cased repeat as the same genre", () => {
    expect(mergeLabels(["Action"], ["action", "RPG"])).toEqual([
      "Action",
      "RPG",
    ]);
  });

  it("trims and drops blanks from what RAWG sends", () => {
    expect(mergeLabels(["Action"], ["  RPG  ", "   ", "Indie"])).toEqual([
      "Action",
      "RPG",
      "Indie",
    ]);
  });

  it("skips an over-long genre instead of throwing", () => {
    expect(mergeLabels(["Action"], ["x".repeat(101), "RPG"])).toEqual([
      "Action",
      "RPG",
    ]);
  });

  it("never shortens a stored list that would not normalize cleanly", () => {
    expect(mergeLabels(["Action", "action"], ["RPG"])).toBeNull();
  });
});
