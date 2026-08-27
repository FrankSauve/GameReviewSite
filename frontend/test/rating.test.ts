import { describe, expect, it } from "vitest";
import {
  RATING_MAX,
  RATING_MIN,
  RATING_VALUES,
  formatRating,
  ratingColor,
  snapRating,
} from "../src/lib/rating";

/**
 * The scale is enforced by the backend; these tests pin the shape of what the
 * input can offer, so the picker cannot produce a value the API would refuse.
 */
describe("RATING_VALUES", () => {
  it("covers the whole scale in half points", () => {
    expect(RATING_VALUES).toHaveLength(19);
    expect(RATING_VALUES[0]).toBe(RATING_MIN);
    expect(RATING_VALUES.at(-1)).toBe(RATING_MAX);
  });

  it("offers 9.5 but never 9.4", () => {
    expect(RATING_VALUES).toContain(9.5);
    expect(RATING_VALUES).not.toContain(9.4);
  });

  /**
   * Halves are exact in binary floating point, so no value should arrive with a
   * representation error — which is what lets the backend check `x * 2` without
   * an epsilon.
   */
  it("produces exact halves, not accumulated float error", () => {
    for (const v of RATING_VALUES) expect(Number.isInteger(v * 2)).toBe(true);
  });
});

describe("formatRating", () => {
  it("prints a half point", () => {
    expect(formatRating(9.5)).toBe("9.5");
  });

  it("prints a whole score without a trailing zero", () => {
    expect(formatRating(9)).toBe("9");
    expect(formatRating(10)).toBe("10");
  });

  /** Averages are not on the scale, so they still get one decimal. */
  it("rounds an average to one decimal", () => {
    expect(formatRating(8.333333)).toBe("8.3");
  });
});

describe("ratingColor", () => {
  it("puts the boundaries in the band they read as", () => {
    expect(ratingColor(10)).toBe("text-emerald-400");
    expect(ratingColor(8)).toBe("text-emerald-400");
    expect(ratingColor(7.5)).toBe("text-amber-400");
    expect(ratingColor(6)).toBe("text-amber-400");
    expect(ratingColor(5.5)).toBe("text-red-400");
    expect(ratingColor(1)).toBe("text-red-400");
  });
});

describe("snapRating", () => {
  it("snaps to the nearest half point", () => {
    expect(snapRating(9.4)).toBe(9.5);
    expect(snapRating(9.2)).toBe(9);
    expect(snapRating(9.75)).toBe(10);
  });

  it("clamps to the scale", () => {
    expect(snapRating(0)).toBe(RATING_MIN);
    expect(snapRating(-4)).toBe(RATING_MIN);
    expect(snapRating(99)).toBe(RATING_MAX);
  });
});
