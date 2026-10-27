// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { AddReviewForm } from "../src/components/AddReviewForm";
import { CREATE_REVIEW, GET_ME } from "../src/graphql/mutations";
import { GET_USER_REVIEW_SUMMARIES } from "../src/graphql/queries";
import { AuthProvider } from "../src/contexts/AuthContext";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(cleanup);

const meMock = {
  request: { query: GET_ME },
  result: {
    data: {
      me: {
        __typename: "User",
        id: "u1",
        slug: "alice",
        username: "alice",
        avatarColor: null,
        theme: null,
        palette: null,
        email: "alice@example.com",
      },
    },
  },
};

const filedAs = (id: string, genre: string) => ({
  __typename: "ReviewSummary",
  id,
  slug: `alice/${id}`,
  rating: 8,
  genre,
  secondaryGenres: [],
  yearPlayed: 2024,
  hoursPlayed: 12,
  createdAt: "2026-01-01T00:00:00.000Z",
  commentCount: 0,
  game: {
    __typename: "Game",
    id: `g-${id}`,
    slug: id,
    title: id,
    coverUrl: null,
    releaseYear: 2015,
    genres: [],
    communityGenres: [],
  },
});

/** The profile's own query, which the form reads its headings from. */
const summariesMock = {
  request: {
    query: GET_USER_REVIEW_SUMMARIES,
    variables: { id: "alice", order: "RATING_DESC" },
  },
  result: {
    data: {
      user: {
        __typename: "User",
        id: "u1",
        slug: "alice",
        username: "alice",
        avatarColor: null,
        bio: null,
        reviewCount: 3,
        averageRating: 8,
      },
      reviewSummariesByUser: [
        filedAs("hollow-knight", "Metroidvania"),
        filedAs("ori", "Metroidvania"),
        filedAs("witcher-3", "RPG"),
      ],
    },
  },
};

function createMock(genre: string | null) {
  return {
    request: {
      query: CREATE_REVIEW,
      variables: {
        input: {
          gameId: "g1",
          rating: 8,
          content: "Played it.",
          yearPlayed: new Date().getFullYear(),
          hoursPlayed: 12,
          platform: "PC",
          genre,
          secondaryGenres: [],
        },
      },
    },
    result: {
      data: {
        createReview: {
          __typename: "Review",
          id: "r1",
          slug: "alice/hollow-knight",
          rating: 8,
          content: "Played it.",
          yearPlayed: new Date().getFullYear(),
          hoursPlayed: 12,
          platform: "PC",
          genre,
          secondaryGenres: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          user: {
            __typename: "User",
            id: "u1",
            username: "alice",
            slug: "alice",
            avatarColor: null,
          },
          comments: [],
          game: { __typename: "Game", id: "g1", slug: "hades" },
        },
      },
    },
  };
}

async function renderForm(extra: readonly MockLink.MockedResponse[] = []) {
  const onSuccess = vi.fn();
  render(
    <MockedProvider mocks={[meMock, summariesMock, ...extra]}>
      <AuthProvider>
        <AddReviewForm
          target={{ gameId: "g1" }}
          gameGenres={["Action", "rpg", "Platformer"]}
          onSuccess={onSuccess}
        />
      </AuthProvider>
    </MockedProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText("Genre")).toBeTruthy());
  return onSuccess;
}

function suggestions(): string[] {
  const input = screen.getByLabelText("Genre") as HTMLInputElement;
  return [...(input.list?.options ?? [])].map((o) => o.value);
}

function fillBody() {
  fireEvent.change(screen.getByPlaceholderText(/Share your thoughts/), {
    target: { value: "Played it." },
  });
  fireEvent.change(screen.getByLabelText("Hours played"), {
    target: { value: "12" },
  });
}

describe("choosing the genre a review is filed under", () => {
  it("suggests the reviewer's own genres, then the game's not already among them", async () => {
    await renderForm();
    await waitFor(() =>
      expect(suggestions()).toEqual([
        "Metroidvania",
        "RPG",
        "Action",
        "Platformer",
      ]),
    );
  });

  it("sends what was typed, trimmed", async () => {
    const onSuccess = await renderForm([createMock("Metroidvania")]);
    fillBody();
    fireEvent.change(screen.getByLabelText("Genre"), {
      target: { value: "  Metroidvania " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Review" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  /** Null leaves the profile to fall back to the game's genres. */
  it("sends null when left blank", async () => {
    const onSuccess = await renderForm([createMock(null)]);
    fillBody();
    fireEvent.click(screen.getByRole("button", { name: "Submit Review" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
