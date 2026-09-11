// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { HomePage } from "../src/pages/HomePage";
import { AuthProvider } from "../src/contexts/AuthContext";
import {
  GET_RECENT_REVIEWS,
  RECENT_REVIEWS_PAGE_SIZE,
} from "../src/graphql/queries";
import { GET_ME } from "../src/graphql/mutations";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(cleanup);

const TOTAL = 30;

const review = (n: number) => ({
  __typename: "Review",
  id: `r${n}`,
  slug: `alice/game-${n}`,
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
    id: `g${n}`,
    slug: `game-${n}`,
    title: `Game ${n}`,
    genres: ["FPS"],
    coverUrl: null,
    releaseYear: 1998,
  },
  reactions: [],
  comments: [],
});

/**
 * Apollo matches a mock on the exact variables, so these double as the
 * assertion: an offset the page never sends matches no mock and renders
 * nothing.
 */
const pageMock = (page: number) => ({
  request: {
    query: GET_RECENT_REVIEWS,
    variables: { offset: page * RECENT_REVIEWS_PAGE_SIZE },
  },
  result: {
    data: {
      recentReviews: [review(page * RECENT_REVIEWS_PAGE_SIZE + 1)],
      recentReviewsCount: TOTAL,
    },
  },
});

/** A page past the end: the count still stands, the page itself is empty. */
const overshootMock = {
  request: {
    query: GET_RECENT_REVIEWS,
    variables: { offset: 98 * RECENT_REVIEWS_PAGE_SIZE },
  },
  result: { data: { recentReviews: [], recentReviewsCount: TOTAL } },
};

const anonMock = { request: { query: GET_ME }, result: { data: { me: null } } };

function Url() {
  const { search } = useLocation();
  return <div data-testid="url">{search}</div>;
}

function renderAt(path: string) {
  return render(
    <MockedProvider
      mocks={[pageMock(0), pageMock(1), pageMock(2), overshootMock, anonMock]}
    >
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <HomePage />
          <Url />
        </MemoryRouter>
      </AuthProvider>
    </MockedProvider>,
  );
}

const url = () => screen.getByTestId("url").textContent;

describe("the recent reviews pagination", () => {
  it("shows the first page for a bare URL", async () => {
    renderAt("/");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
  });

  /** ?page=3 is one-based for the reader and zero-based for the offset. */
  it("asks for the right offset when the URL names a page", async () => {
    renderAt("/?page=3");
    await waitFor(() => expect(screen.getByText("Game 21")).toBeTruthy());
  });

  it("treats a nonsensical page number as the first page", async () => {
    renderAt("/?page=banana");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
  });

  it("treats a page below one as the first page", async () => {
    renderAt("/?page=0");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
  });

  /**
   * The point of the whole exercise: the page number lives in the URL, so it
   * survives leaving the page and coming back.
   */
  it("puts the page number in the URL when a page is chosen", async () => {
    renderAt("/");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    await waitFor(() => expect(screen.getByText("Game 21")).toBeTruthy());
    expect(url()).toBe("?page=3");
  });

  it("leaves page one as the bare URL, so it is not a history entry", async () => {
    renderAt("/?page=3");
    await waitFor(() => expect(screen.getByText("Game 21")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
    expect(url()).toBe("");
  });

  it("keeps unrelated query parameters when the page changes", async () => {
    renderAt("/?ref=newsletter");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => expect(screen.getByText("Game 11")).toBeTruthy());
    expect(url()).toBe("?ref=newsletter&page=2");
  });

  it("says the page is empty rather than that the site is", async () => {
    renderAt("/?page=99");
    await waitFor(() =>
      expect(screen.getByText("Nothing on this page")).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /back to page one/ }));
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
    expect(url()).toBe("");
  });
});
