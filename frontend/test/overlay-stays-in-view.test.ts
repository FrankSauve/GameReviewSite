import { describe, expect, it } from "vitest";
import { positionBelow } from "../src/lib/overlayPosition";

/**
 * Pins the placement an emoji menu depends on. It is measured rather than
 * written as `absolute top-full` because the menu is portaled out of its card;
 * see AnchoredOverlay for why it has to be.
 */
const viewport = { width: 1000, height: 800 };
const anchor = { top: 100, left: 200, width: 40, height: 20 };

describe("placing an overlay under its anchor", () => {
  it("opens below, with a gap", () => {
    expect(
      positionBelow(anchor, { width: 288, height: 300 }, viewport),
    ).toEqual({ top: 128, left: 200 });
  });

  it("flips above when there is no room below", () => {
    const low = { ...anchor, top: 700 };
    expect(positionBelow(low, { width: 288, height: 300 }, viewport)).toEqual({
      top: 392,
      left: 200,
    });
  });

  it("stays below when neither side fits, rather than flipping off the top", () => {
    const tall = { width: 288, height: 780 };
    expect(positionBelow({ ...anchor, top: 400 }, tall, viewport).top).toBe(12);
  });

  it("centres on the anchor when asked, rather than starting at it", () => {
    const wide = { ...anchor, left: 200, width: 64 };
    expect(
      positionBelow(wide, { width: 220, height: 100 }, viewport, "center").left,
    ).toBe(122);
  });

  it("holds a centred overlay off the left edge too", () => {
    const edge = { ...anchor, left: 0, width: 64 };
    expect(
      positionBelow(edge, { width: 220, height: 100 }, viewport, "center").left,
    ).toBe(8);
  });

  it("pulls back from the right edge instead of overflowing it", () => {
    const right = { ...anchor, left: 900 };
    expect(
      positionBelow(right, { width: 288, height: 100 }, viewport).left,
    ).toBe(704);
  });

  it("keeps the top edge on screen for an overlay taller than the viewport", () => {
    expect(
      positionBelow(anchor, { width: 288, height: 900 }, viewport).top,
    ).toBe(8);
  });

  it("keeps the left edge on screen for an overlay wider than the viewport", () => {
    expect(
      positionBelow(anchor, { width: 1200, height: 100 }, viewport).left,
    ).toBe(8);
  });
});
