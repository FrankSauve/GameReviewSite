import { describe, expect, it } from "vitest";
import { pageItems } from "../src/components/Pagination";

/**
 * The control the issue was filed against rendered one button per page, so the
 * only thing that could go wrong was the width of the row. Windowing the numbers
 * introduces a way to be wrong about *which* pages are reachable, which is what
 * these cover: the current page and both ends must always be there.
 */
describe("pageItems", () => {
  it("shows every page when they all fit", () => {
    expect(pageItems(2, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("elides the run between the first page and the current one", () => {
    expect(pageItems(5, 10)).toEqual([0, null, 4, 5, 6, null, 9]);
  });

  it("spells out a gap of exactly one rather than eliding it", () => {
    // "1 … 3" is no narrower than "1 2 3" and hides a page for nothing.
    expect(pageItems(3, 4)).toEqual([0, 1, 2, 3]);
  });

  it("always includes the first and last page", () => {
    for (const page of [0, 1, 7, 19]) {
      const items = pageItems(page, 20);
      expect(items).toContain(0);
      expect(items).toContain(19);
      expect(items).toContain(page);
    }
  });

  it("never repeats a page or goes out of range", () => {
    const items = pageItems(0, 3).filter((p): p is number => p !== null);
    expect(items).toEqual([...new Set(items)]);
    expect(items.every((p) => p >= 0 && p < 3)).toBe(true);
  });

  it("copes with a single page", () => {
    expect(pageItems(0, 1)).toEqual([0]);
  });
});
