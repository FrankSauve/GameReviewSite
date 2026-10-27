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
        { ...filedAs("witcher-3", "RPG"), secondaryGenres: ["Open World"] },
      ],
    },
  },
};

function createMock(genre: string | null, secondaryGenres: string[]) {
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
          secondaryGenres,
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
          secondaryGenres,
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

const field = () => screen.getByLabelText(/Other genres/) as HTMLInputElement;

function chips(): string[] {
  return screen
    .queryAllByRole("button", { name: /^Remove / })
    .map((b) => (b.getAttribute("aria-label") ?? "").replace(/^Remove /, ""));
}

function suggestions(): string[] {
  return [...(field().list?.options ?? [])].map((o) => o.value);
}

function type(value: string) {
  fireEvent.change(field(), { target: { value } });
}

function enter() {
  fireEvent.keyDown(field(), { key: "Enter" });
}

function fillBody() {
  fireEvent.change(screen.getByPlaceholderText(/Share your thoughts/), {
    target: { value: "Played it." },
  });
  fireEvent.change(screen.getByLabelText("Hours played"), {
    target: { value: "12" },
  });
}

describe("adding secondary genres to a review", () => {
  it("adds one on Enter without submitting the review", async () => {
    const onSuccess = await renderForm();
    type("Horror");
    enter();
    expect(chips()).toEqual(["Horror"]);
    expect(field().value).toBe("");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("splits a typed or pasted list at its commas", async () => {
    await renderForm();
    type("Horror, Open  World,Sho");
    expect(chips()).toEqual(["Horror", "Open World"]);
    expect(field().value).toBe("Sho");
  });

  it("ignores a repeat, ignoring case, and the review's own genre", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText("Genre"), {
      target: { value: "Action" },
    });
    type("Horror,horror,ACTION,");
    expect(chips()).toEqual(["Horror"]);
  });

  it("stops at five", async () => {
    await renderForm();
    type("a,b,c,d,e,f,");
    expect(chips()).toEqual(["a", "b", "c", "d", "e"]);
    expect(field().disabled).toBe(true);
  });

  it("hides one the genre comes to repeat, and frees its place", async () => {
    await renderForm();
    type("Horror,b,c,d,e,");
    expect(field().disabled).toBe(true);
    const genre = screen.getByLabelText("Genre");
    fireEvent.change(genre, { target: { value: "horror" } });
    expect(chips()).toEqual(["b", "c", "d", "e"]);
    expect(field().disabled).toBe(false);
    fireEvent.change(genre, { target: { value: "Action" } });
    expect(chips()).toEqual(["Horror", "b", "c", "d", "e"]);
  });

  it("removes one", async () => {
    await renderForm();
    type("Horror,Shooter,");
    fireEvent.click(screen.getByRole("button", { name: "Remove Horror" }));
    expect(chips()).toEqual(["Shooter"]);
  });

  it("suggests the reviewer's genres, leaving out the chosen ones and the review's own", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText("Genre"), {
      target: { value: "rpg" },
    });
    type("Metroidvania,");
    await waitFor(() =>
      expect(suggestions()).toEqual(["Open World", "Action", "Platformer"]),
    );
  });

  /** Leaving the field adds what was typed, so it is not lost on submit. */
  it("sends what was added, including one still in the field", async () => {
    const onSuccess = await renderForm([
      createMock("Action", ["Horror", "Shooter"]),
    ]);
    fillBody();
    fireEvent.change(screen.getByLabelText("Genre"), {
      target: { value: "Action" },
    });
    type("Horror,");
    type("Shooter");
    fireEvent.blur(field());
    fireEvent.click(screen.getByRole("button", { name: "Submit Review" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
