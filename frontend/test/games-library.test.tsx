// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";

/** See profile-views.test.tsx: vitest runs without globals, so this is manual. */
afterEach(cleanup);

import { GET_GAMES, GET_GAME_FACETS, GET_USERS } from "../src/graphql/queries";
import { GameLibraryPage } from "../src/pages/GameLibraryPage";

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

/**
 * Apollo matches a mock on the exact variables, so these double as the
 * assertion: if the page ever sent a different offset, sort or filter, no mock
 * would match and nothing would render.
 */
function listMock(vars: Record<string, unknown>, first: number, total = TOTAL) {
  return {
    request: {
      query: GET_GAMES,
      variables: { limit: PAGE_SIZE, offset: 0, sort: "NEWEST", ...vars },
    },
    result: {
      data: { games: [game(first), game(first + 1)], gamesCount: total },
    },
  };
}

const pageMock = (page: number) =>
  listMock({ offset: page * PAGE_SIZE }, page * PAGE_SIZE + 1);

const facetsMock = {
  request: { query: GET_GAME_FACETS },
  result: {
    data: {
      gameFacets: { genres: ["FPS", "RPG"], platforms: ["PC", "Switch"] },
    },
  },
};

const usersMock = {
  request: { query: GET_USERS },
  result: {
    data: {
      users: [
        {
          __typename: "User",
          id: "u1",
          slug: "alice",
          username: "alice",
          reviewCount: 3,
          averageRating: 8,
        },
      ],
    },
  },
};

function renderAt(path: string, extra: MockedResponse[] = []) {
  return render(
    <MockedProvider
      mocks={[pageMock(0), pageMock(1), pageMock(2), facetsMock, usersMock, ...extra]}
    >
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


  it("carries the sort in the query into the request", async () => {
    renderAt("/games?sort=TITLE", [listMock({ sort: "TITLE" }, 101)]);
    await waitFor(() => expect(screen.getByText("Game 101")).toBeTruthy());
  });

  it("falls back to the default sort when the URL names an unknown one", async () => {
    renderAt("/games?sort=BOGUS");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
  });

  it("sends each filter the URL carries", async () => {
    renderAt("/games?genre=RPG&platform=PC&reviewedBy=alice&reviewed=1", [
      listMock(
        { genre: "RPG", platform: "PC", reviewedBy: "alice", reviewedOnly: true },
        201
      ),
    ]);
    await waitFor(() => expect(screen.getByText("Game 201")).toBeTruthy());
  });

  it("offers the catalogue's own labels in the filter menus", async () => {
    renderAt("/games");
    await waitFor(() => expect(screen.getByText("Game 1")).toBeTruthy());
    const genre = screen.getByLabelText("Genre") as HTMLSelectElement;
    expect([...genre.options].map((o) => o.value)).toEqual(["", "FPS", "RPG"]);
    const platform = screen.getByLabelText("Platform") as HTMLSelectElement;
    expect([...platform.options].map((o) => o.value)).toEqual(["", "PC", "Switch"]);
  });

  /**
   * A page number describes one result set. Carried across a filter change it
   * lands the reader on an empty page of a shorter list.
   */
  it("returns to page one when a filter changes", async () => {
    renderAt("/games?page=3", [listMock({ genre: "RPG" }, 301)]);
    await waitFor(() => expect(screen.getByText("Game 49")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Genre"), { target: { value: "RPG" } });
    await waitFor(() => expect(screen.getByText("Game 301")).toBeTruthy());
  });
});
