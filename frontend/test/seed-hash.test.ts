import { describe, expect, it } from "vitest";
import { seedHash } from "../src/lib/hash";

/**
 * Shared by the avatar palette and the cover placeholder, so a change here
 * repaints both. See #107 for the sum-of-char-codes it replaced.
 */
describe("the colour seed hash", () => {
  it("gives one seed one answer", () => {
    expect(seedHash("alice")).toBe(seedHash("alice"));
  });

  it("depends on order, which a sum of char codes does not", () => {
    expect(seedHash("alice")).not.toBe(seedHash("aclie"));
    expect(seedHash("Limbo")).not.toBe(seedHash("Bloim"));
  });

  /** It indexes into an array, so a negative would read off the front. */
  it("is never negative, however long the seed", () => {
    for (const seed of ["", "a", "a".repeat(500), "🎮🎮🎮", "Ω≈ç√"]) {
      expect(seedHash(seed)).toBeGreaterThanOrEqual(0);
    }
  });

  it("spreads short seeds, which a sum clusters", () => {
    const buckets = new Set(
      ["Ico", "Rez", "Doom", "Myst", "Pong", "Halo"].map(
        (t) => seedHash(t) % 6,
      ),
    );
    expect(buckets.size).toBeGreaterThan(2);
  });
});
