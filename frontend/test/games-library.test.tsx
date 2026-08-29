// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";

/** See profile-views.test.tsx: vitest runs without globals, so this is manual. */
afterEach(cleanup);

import { GET_GAMES } from "../src/graphql/queries";
import { GameLibraryPage } from "../src/pages/GameLibraryPage";

/**
 * The page is paged entirely from the server, so what these tests are really
 * checking is that the page number in the URL and the `offset` in the query stay
 * in step. Getting that wrong shows a plausible-looking grid of the wrong games,
 * which is not something a reader would notice.
 */

const PAGE_SIZE = 24;
const TOTAL = 60;

const game = (n: number) => ({
  __typename: "Game",
  id: `g${n}`,
  slug: `game-${n}`,
  title: `Game ${n}`,
  genres: ["RPG"],
  platforms: ["PC"],
  coverUrl: null,
  releaseYear: 2020,
  averageRating: 8,
  reviewCount: 3,
});

function pageMock(page: number) {
  const first = page * PAGE_SIZE + 1;
  return {
    request: {
      query: GET_GAMES,
      variables: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    },
    result: {
      data: {
        games: [game(first), game(first + 1)],
        gamesCount: TOTAL,
      },
    },
  };
}

function renderAt(path: string) {
  return render(
    <MockedProvider mocks={[pageMock(0), pageMock(1), pageMock(2)]}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/games" element={<GameLibraryPage />} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>
  );
}

describe("the games library page", () => {
  it("shows the first page for a bare URL", async () => {
    renderAt("/games");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
  });

  it("reports the total from the server, not the page length", async () => {
    // Two games are rendered; sixty exist. The count describes the library.
    renderAt("/games");
    await waitFor(() => expect(screen.getByText("60 games")).toBeTruthy());
  });

  /** ?page=2 is one-based for the reader and zero-based for the offset. */
  it("asks for the right offset when the URL names a page", async () => {
    renderAt("/games?page=3");
    await waitFor(() => expect(screen.getByText("Game 49")).toBeTruthy());
  });

  it("treats a nonsensical page number as the first page", async () => {
    renderAt("/games?page=banana");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
  });

  it("treats a page below one as the first page", async () => {
    renderAt("/games?page=0");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
  });

  it("renders a control for each of the three pages sixty games make", async () => {
    renderAt("/games");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
    for (const label of ["1", "2", "3"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });
});
