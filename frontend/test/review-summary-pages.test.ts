import { describe, expect, it } from "vitest";
import {
  REVIEW_SUMMARY_PAGE as PAGE,
  mergeSummaryPage,
  nextSummaryOffset,
} from "../src/lib/reviewSummaryPages";

const ids = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => `r${from + i}`);
const id = (r: string) => r;

describe("paging through a profile's reviews", () => {
  it("asks for the next page after a full one, while reviews remain", () => {
    expect(nextSummaryOffset(PAGE, PAGE + 2)).toBe(PAGE);
    expect(nextSummaryOffset(2 * PAGE, 2 * PAGE + 1)).toBe(2 * PAGE);
  });

  it("stops once every review is loaded", () => {
    expect(nextSummaryOffset(PAGE, PAGE)).toBeNull();
    expect(nextSummaryOffset(3, 3)).toBeNull();
    expect(nextSummaryOffset(0, 0)).toBeNull();
  });

  /** The count can be stale; a short page is still the end, never a loop. */
  it("stops after a short page even when the count says more", () => {
    expect(nextSummaryOffset(PAGE - 1, PAGE + 10)).toBeNull();
  });

  it("appends a later page", () => {
    expect(mergeSummaryPage(ids(0, 3), ids(3, 5), 3, 3, id)).toEqual(ids(0, 5));
  });

  it("is idempotent when the same page lands twice", () => {
    const once = mergeSummaryPage(ids(0, 3), ids(3, 6), 3, 3, id);
    expect(mergeSummaryPage(once, ids(3, 6), 3, 3, id)).toEqual(ids(0, 6));
  });

  /** A refetch of page one after a delete: the list ends where the page does. */
  it("drops the old tail when a short first page comes back", () => {
    expect(mergeSummaryPage(ids(0, 5), ["r0", "r2"], 0, 3, id)).toEqual([
      "r0",
      "r2",
    ]);
  });

  /** A refetch of a full first page keeps later pages, without a review twice. */
  it("keeps later pages under a refreshed full first page, without repeats", () => {
    expect(mergeSummaryPage(ids(0, 6), ["new", "r0", "r1"], 0, 3, id)).toEqual([
      "new",
      "r0",
      "r1",
      "r3",
      "r4",
      "r5",
    ]);
  });
});
