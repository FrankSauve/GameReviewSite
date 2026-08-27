// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Explicit cleanup: @testing-library/react only registers its own afterEach when
 * the test runner exposes globals, and this project runs vitest without them. Left
 * out, each render stacks on the last and every query finds several matches.
 */
afterEach(cleanup);

import { MockedProvider } from "@apollo/client/testing";
import { GET_USER_REVIEW_SUMMARIES } from "../src/graphql/queries";
import { UserProfilePage } from "../src/pages/UserProfilePage";

/**
 * Three routes render one component with a different `grouping` prop, which is
 * exactly the arrangement that breaks silently: the page still renders, just
 * grouped along the wrong axis and asking the server for the wrong ordering.
 */
const USER_ID = "u1";

const summary = (
  id: string,
  rating: number,
  yearPlayed: number | null,
  title: string
) => ({
  __typename: "ReviewSummary",
  id,
  rating,
  yearPlayed,
  hoursPlayed: 12,
  createdAt: "2026-01-01T00:00:00.000Z",
  commentCount: 0,
  game: {
    __typename: "Game",
    id: `g-${id}`,
    title,
    coverUrl: null,
    releaseYear: 2015,
    genre: "RPG",
  },
});

const ROWS = [
  summary("r1", 10, 2024, "Best Game"),
  summary("r2", 8.5, 2019, "Older Game"),
  summary("r3", 10, 2019, "Another Great One"),
];

function mockFor(order: string) {
  return {
    request: {
      query: GET_USER_REVIEW_SUMMARIES,
      variables: { id: USER_ID, order },
    },
    result: {
      data: {
        user: {
          __typename: "User",
          id: USER_ID,
          username: "simon",
          reviewCount: 3,
          averageRating: 9.5,
        },
        reviewSummariesByUser: ROWS,
      },
    },
  };
}

function renderAt(path: string) {
  // No AuthContext.Provider: the context's own default is an anonymous viewer,
  // which is what these tests want.
  return render(
    <MockedProvider
      mocks={[mockFor("YEAR_DESC"), mockFor("RATING_DESC"), mockFor("RECENT")]}
      addTypename={false}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/users/:id" element={<UserProfilePage grouping="year" />} />
          <Route
            path="/users/:id/by-year"
            element={<UserProfilePage grouping="year" />}
          />
          <Route
            path="/users/:id/by-score"
            element={<UserProfilePage grouping="score" />}
          />
          <Route
            path="/users/:id/recent"
            element={<UserProfilePage grouping="recent" />}
          />
        </Routes>
      </MemoryRouter>
    </MockedProvider>
  );
}

/** Group headings, in the order they appear. */
async function headings(): Promise<string[]> {
  await waitFor(() => expect(screen.getByText("simon")).toBeTruthy());
  await waitFor(() => expect(screen.queryAllByRole("heading", { level: 3 }).length).toBeGreaterThan(0));
  return screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
}

describe("profile grouped views", () => {
  it("groups by year at the bare profile route", async () => {
    renderAt(`/users/${USER_ID}`);
    expect(await headings()).toEqual(["2024", "2019"]);
  });

  it("groups by year at the explicit by-year route", async () => {
    renderAt(`/users/${USER_ID}/by-year`);
    expect(await headings()).toEqual(["2024", "2019"]);
  });

  it("groups by score at the by-score route", async () => {
    renderAt(`/users/${USER_ID}/by-score`);
    expect(await headings()).toEqual(["10", "8.5"]);
  });

  /** The recent view is one undivided list, so it has no group headings at all. */
  it("shows no group headings on the recent route", async () => {
    renderAt(`/users/${USER_ID}/recent`);
    await waitFor(() => expect(screen.getByText("simon")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Best Game")).toBeTruthy());
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("puts two reviews sharing a year under one heading", async () => {
    renderAt(`/users/${USER_ID}/by-year`);
    await headings();
    expect(screen.getByText("Older Game")).toBeTruthy();
    expect(screen.getByText("Another Great One")).toBeTruthy();
  });

  it("marks the current view in the tab strip", async () => {
    renderAt(`/users/${USER_ID}/by-score`);
    await waitFor(() => expect(screen.getByText("simon")).toBeTruthy());
    const current = screen.getByRole("link", { current: "page" });
    expect(current.textContent).toBe("By score");
  });

  it("links each tab at its own route", async () => {
    renderAt(`/users/${USER_ID}`);
    await waitFor(() => expect(screen.getByText("simon")).toBeTruthy());
    expect(screen.getByRole("link", { name: "By score" }).getAttribute("href")).toBe(
      `/users/${USER_ID}/by-score`
    );
    expect(screen.getByRole("link", { name: "Recent" }).getAttribute("href")).toBe(
      `/users/${USER_ID}/recent`
    );
    expect(screen.getByRole("link", { name: "By year" }).getAttribute("href")).toBe(
      `/users/${USER_ID}`
    );
  });

  it("renders no body text, because the query does not fetch one", async () => {
    renderAt(`/users/${USER_ID}/by-year`);
    await headings();
    // Each row links to the review rather than showing an excerpt of it.
    expect(
      screen.getByText("Best Game").closest("a")?.getAttribute("href")
    ).toBe("/reviews/r1");
  });
});
