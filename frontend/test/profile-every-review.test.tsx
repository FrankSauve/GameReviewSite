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

function page(offset: number, rows: unknown[]) {
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
          reviewCount: PAGE + 2,
          averageRating: 8,
          hoursPlayed: 1234,
        },
        reviewSummariesByUser: rows,
      },
    },
  };
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
});
