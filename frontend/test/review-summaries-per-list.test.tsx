// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

/** See profile-views.test.tsx: vitest runs without globals, so RTL registers none. */
afterEach(cleanup);

import { MockedProvider } from "@apollo/client/testing/react";
import { createCache } from "../src/apolloCache";
import { GET_USER_REVIEW_SUMMARIES } from "../src/graphql/queries";
import { REVIEW_SUMMARY_PAGE as PAGE } from "../src/lib/reviewSummaryPages";
import { useReviewSummaries } from "../src/hooks/useReviewSummaries";

const summary = (user: string, i: number) => ({
  __typename: "ReviewSummary",
  id: `${user}-r${i}`,
  slug: `${user}/game-${i}`,
  rating: 8,
  yearPlayed: 2024,
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

function page(
  user: string,
  offset: number,
  count: number,
  reviewCount: number,
) {
  return {
    request: {
      query: GET_USER_REVIEW_SUMMARIES,
      variables: { id: user, order: "YEAR_DESC", limit: PAGE, offset },
    },
    result: {
      data: {
        user: {
          __typename: "User",
          id: `id-${user}`,
          slug: user,
          username: user,
          avatarColor: null,
          bio: null,
          reviewCount,
          averageRating: 8,
          hoursPlayed: 1,
        },
        reviewSummariesByUser: Array.from({ length: count }, (_, i) =>
          summary(user, offset + i),
        ),
      },
    },
  };
}

describe("paging one profile, then another", () => {
  /**
   * The profile page stays mounted from one account to the next, so what one
   * list learned about an offset must not stop another list at that offset.
   */
  it("still reads on for a second account after the first ran out early", async () => {
    const mocks = [
      // Alice's count is ahead of her rows: her page at 1 comes back empty.
      page("alice", 0, 1, 3),
      page("alice", 1, 0, 3),
      // Bob has three reviews over two pages, the second also at offset 1.
      page("bob", 0, 1, 3),
      page("bob", 1, 2, 3),
    ];
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useReviewSummaries(id, "YEAR_DESC"),
      {
        initialProps: { id: "alice" },
        wrapper: ({ children }: { children: ReactNode }) => (
          <MockedProvider cache={createCache()} mocks={mocks}>
            {children}
          </MockedProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.complete).toBe(true));

    rerender({ id: "bob" });
    await waitFor(() =>
      expect(result.current.data?.reviewSummariesByUser).toHaveLength(3),
    );
    expect(result.current.complete).toBe(true);
  });
});
