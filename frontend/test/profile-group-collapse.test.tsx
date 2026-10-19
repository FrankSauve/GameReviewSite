// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GroupedReviewList } from "../src/components/GroupedReviewList";
import { groupReviews, type ReviewSummary } from "../src/lib/grouping";

// Explicit cleanup, as in profile-views.test.tsx: vitest runs without globals.
afterEach(cleanup);

const review = (
  id: string,
  title: string,
  yearPlayed: number,
): ReviewSummary => ({
  id,
  rating: 8,
  yearPlayed,
  hoursPlayed: 10,
  createdAt: "2026-01-01T00:00:00.000Z",
  commentCount: 0,
  game: { id: `g-${id}`, title, genres: ["RPG"] },
});

const ROWS = [
  review("r1", "Newer Game", 2024),
  review("r2", "Older Game", 2019),
  review("r3", "Also Older", 2019),
];

function renderGrouped(grouping: "year" | "recent") {
  return render(
    <MemoryRouter>
      <GroupedReviewList
        groups={groupReviews(ROWS, grouping)}
        showGroupAverage={false}
      />
    </MemoryRouter>,
  );
}

const toggleFor = (label: string) =>
  screen.getByRole("button", { name: label });

const visibleTitles = () =>
  ROWS.map((r) => r.game?.title ?? "").filter((t) => screen.queryByText(t));

describe("collapsing review groups", () => {
  it("starts with every group open", () => {
    renderGrouped("year");
    expect(toggleFor("2024").getAttribute("aria-expanded")).toBe("true");
    expect(visibleTitles()).toEqual(["Newer Game", "Older Game", "Also Older"]);
  });

  it("hides one group's rows from its heading, and brings them back", () => {
    renderGrouped("year");
    fireEvent.click(toggleFor("2019"));
    expect(toggleFor("2019").getAttribute("aria-expanded")).toBe("false");
    expect(visibleTitles()).toEqual(["Newer Game"]);
    // The heading itself stays, so the group can be reopened.
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["2024", "2019"]);

    fireEvent.click(toggleFor("2019"));
    expect(visibleTitles()).toEqual(["Newer Game", "Older Game", "Also Older"]);
  });

  it("collapses every group at once, then shows them all again", () => {
    renderGrouped("year");
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(visibleTitles()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(visibleTitles()).toEqual(["Newer Game", "Older Game", "Also Older"]);
  });

  /** Collapsing each group by hand is the same state as Collapse all. */
  it("offers Show all once the last open group is closed by hand", () => {
    renderGrouped("year");
    fireEvent.click(toggleFor("2024"));
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeTruthy();
    fireEvent.click(toggleFor("2019"));
    expect(screen.getByRole("button", { name: "Show all" })).toBeTruthy();
  });

  it("offers no collapsing on the undivided recent list", () => {
    renderGrouped("recent");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(visibleTitles()).toHaveLength(3);
  });
});
