// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/** See profile-views.test.tsx: vitest runs without globals, so RTL registers none. */
afterEach(cleanup);

import { MockedProvider } from "@apollo/client/testing/react";
import { createCache } from "../src/apolloCache";
import { GET_USER_REVIEW_SUMMARIES } from "../src/graphql/queries";
import { REVIEW_SUMMARY_PAGE as PAGE } from "../src/lib/reviewSummaryPages";
import { UserProfilePage } from "../src/pages/UserProfilePage";

const USER_SLUG = "simon";

const summary = (i: number, yearPlayed: number) => ({
  __typename: "ReviewSummary",
  id: `r${i}`,
  slug: `${USER_SLUG}/game-${i}`,
  rating: 8,
  yearPlayed,
  hoursPlayed: 1,
  genre: null,
  secondaryGenres: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  commentCount: 0,
  game: {
    __typename: "Game",
    id: `g${i}`,
    slug: `game-${i}`,
    title: `Game ${i}`,
    coverUrl: null,
    posterUrl: null,
    releaseYear: null,
    genres: [],
    communityGenres: [],
  },
});

function page(offset: number, rows: unknown[], reviewCount = PAGE + 2) {
  return {
    request: {
      query: GET_USER_REVIEW_SUMMARIES,
      variables: { id: USER_SLUG, order: "YEAR_DESC", limit: PAGE, offset },
    },
    result: {
      data: {
        user: {
          __typename: "User",
          id: "u1",
          slug: USER_SLUG,
          username: "simon",
          avatarColor: null,
          bio: null,
          reviewCount,
          averageRating: 8,
          hoursPlayed: 1234,
        },
        reviewSummariesByUser: rows,
      },
    },
  };
}

function renderProfile(mocks: readonly unknown[]) {
  return render(
    <MockedProvider cache={createCache()} mocks={mocks as never}>
      <MemoryRouter initialEntries={[`/users/${USER_SLUG}`]}>
        <Routes>
          <Route path="/users/:id" element={<UserProfilePage tab="year" />} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  );
}

describe("a profile with more reviews than one page", () => {
  it("reads on until it has every review, and totals hours on the server", async () => {
    const first = Array.from({ length: PAGE }, (_, i) => summary(i, 2024));
    const second = [summary(PAGE, 2010), summary(PAGE + 1, 2010)];
    render(
      <MockedProvider
        cache={createCache()}
        mocks={[page(0, first), page(PAGE, second)]}
      >
        <MemoryRouter initialEntries={[`/users/${USER_SLUG}`]}>
          <Routes>
            <Route path="/users/:id" element={<UserProfilePage tab="year" />} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: /2010/ }, { timeout: 5000 }),
    ).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByText("Loading older reviews…")).toBeNull();
    });
    expect(screen.getByText("Game 501")).toBeDefined();
    // From the server, not the 502 hours the loaded rows would sum to.
    expect(screen.getByText("1,234h")).toBeDefined();
  }, 15000);

  /** The server owns the page size; a lower clamp only costs another page. */
  it("reads on when the server returns fewer rows than were asked for", async () => {
    renderProfile([
      page(0, [summary(0, 2024), summary(1, 2024), summary(2, 2024)], 5),
      page(3, [summary(3, 2010), summary(4, 2010)], 5),
    ]);
    expect(await screen.findByText("Game 4")).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByText("Loading older reviews…")).toBeNull();
    });
  });

  /** A count ahead of the rows must end in an empty page, not a loop. */
  it("stops when a page comes back empty, whatever the count says", async () => {
    renderProfile([
      page(0, [summary(0, 2024), summary(1, 2024)], 5),
      page(2, [], 5),
    ]);
    expect(await screen.findByText("Game 1")).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByText("Loading older reviews…")).toBeNull();
    });
  });

  it("says so when a later page fails, rather than loading forever", async () => {
    renderProfile([
      page(0, [summary(0, 2024)], 5),
      {
        request: page(1, []).request,
        error: new Error("network down"),
      },
    ]);
    expect(
      await screen.findByText(
        "Couldn't load older reviews. Reload to try again.",
      ),
    ).toBeDefined();
    expect(screen.getByText("Game 0")).toBeDefined();
  });
});
