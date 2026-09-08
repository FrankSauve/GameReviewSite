import { describe, expect, it } from "vitest";
import { FAVORITE_CATEGORIES, labelFor } from "../src/lib/favoriteCategories";

/**
 * The grid draws this list directly, and the backend copy refuses anything off
 * it, so a key that drifts between the two is a category nobody can fill.
 */
describe("the favorite categories", () => {
  it("offers twenty distinct keys", () => {
    expect(FAVORITE_CATEGORIES).toHaveLength(20);
    expect(new Set(FAVORITE_CATEGORIES.map((c) => c.key)).size).toBe(20);
  });

  it("opens on the headline category", () => {
    expect(FAVORITE_CATEGORIES[0]?.key).toBe("favorite-game");
    expect(FAVORITE_CATEGORIES[1]?.key).toBe("favorite-series");
  });

  it("labels every key", () => {
    for (const { key, label } of FAVORITE_CATEGORIES) {
      expect(labelFor(key)).toBe(label);
    }
  });

  /** So a row from a backend this copy has not caught up to still draws. */
  it("falls back to the key it does not know", () => {
    expect(labelFor("best-vibes")).toBe("best-vibes");
  });
});
