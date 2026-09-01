// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { HomePage } from "../src/pages/HomePage";
import { AuthProvider } from "../src/contexts/AuthContext";
import { GET_RECENT_REVIEWS } from "../src/graphql/queries";
import { GET_ME } from "../src/graphql/mutations";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(cleanup);

const review = {
  __typename: "Review",
  id: "r1",
  slug: "alice/half-life",
  rating: 9,
  content: "Still the best.",
  yearPlayed: 2024,
  hoursPlayed: 20,
  createdAt: "2026-01-01T00:00:00.000Z",
  user: {
    __typename: "User",
    id: "u1",
    slug: "alice",
    username: "alice",
    avatarColor: null,
  },
  game: {
    __typename: "Game",
    id: "g1",
    slug: "half-life",
    title: "Half-Life",
    genres: ["FPS"],
    coverUrl: null,
    releaseYear: 1998,
  },
  reactions: [
    { __typename: "ReactionSummary", emoji: "👍", count: 2, reacted: false },
  ],
  comments: [],
};

const feedMock = {
  request: { query: GET_RECENT_REVIEWS, variables: { offset: 0 } },
  result: { data: { recentReviews: [review], recentReviewsCount: 1 } },
};

const anonMock = {
  request: { query: GET_ME },
  result: { data: { me: null } },
};

function renderHome() {
  return render(
    <MockedProvider mocks={[feedMock, anonMock]}>
      <AuthProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </AuthProvider>
    </MockedProvider>,
  );
}

describe("the recent reviews feed", () => {
  it("shows a review's reactions beside its comment count", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Half-Life")).toBeTruthy());
    expect(screen.getByText(/0 comments/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "React with 👍" }).textContent,
    ).toBe("👍2");
    expect(screen.getByRole("button", { name: "Add a reaction" })).toBeTruthy();
  });
});
