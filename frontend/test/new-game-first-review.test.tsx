// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import { GET_EXTERNAL_GAME } from "../src/graphql/queries";
import { GET_ME } from "../src/graphql/mutations";
import { AuthProvider } from "../src/contexts/AuthContext";
import { NewGamePage } from "../src/pages/NewGamePage";

/** See profile-views.test.tsx: vitest runs without globals, so this is manual. */
afterEach(cleanup);

const meMock = {
  request: { query: GET_ME },
  result: { data: { me: null } },
};

function previewMock(game: { id: string; slug: string } | null) {
  return {
    request: {
      query: GET_EXTERNAL_GAME,
      variables: { source: "RAWG", id: "1" },
    },
    result: {
      data: {
        externalGame: {
          __typename: "ExternalGame",
          source: "RAWG",
          externalId: "1",
          title: "Elden Ring",
          coverUrl: null,
          releaseYear: 2022,
          genres: ["RPG"],
          description: "A game.",
          game: game && { __typename: "Game", ...game },
          libraryMatch: null,
        },
      },
    },
  };
}

function renderAt(game: { id: string; slug: string } | null) {
  render(
    <MockedProvider mocks={[meMock, previewMock(game)]}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/games/new/rawg/1"]}>
          <Routes>
            <Route path="/games/new/:source/:id" element={<NewGamePage />} />
            <Route path="/games/:id" element={<p>game page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </MockedProvider>,
  );
}

describe("a game's first review", () => {
  it("shows the RAWG title above the review form", async () => {
    renderAt(null);
    expect(
      await screen.findByRole("heading", { name: "Elden Ring" }),
    ).toBeTruthy();
    expect(screen.getByText("A game.")).toBeTruthy();
  });

  /** Someone else's first review got there first; review the game they added. */
  it("sends a title already in the library to its game page", async () => {
    renderAt({ id: "g1", slug: "elden-ring" });
    expect(await screen.findByText("game page")).toBeTruthy();
  });
});

describe("a title that looks like a game already in the library", () => {
  const withMatch = () => {
    const preview = previewMock(null);
    const mock = {
      ...preview,
      result: {
        data: {
          externalGame: {
            ...preview.result.data.externalGame,
            libraryMatch: {
              __typename: "Game",
              id: "g1",
              slug: "disco-elysium",
              title: "Disco Elysium",
              releaseYear: 2019,
            },
          },
        },
      },
    };
    render(
      <MockedProvider mocks={[meMock, mock]}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/games/new/rawg/1"]}>
            <Routes>
              <Route path="/games/new/:source/:id" element={<NewGamePage />} />
              <Route path="/games/:id" element={<p>game page</p>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </MockedProvider>,
    );
  };

  it("asks before offering the review form", async () => {
    withMatch();
    expect(await screen.findByText(/already in the library/i)).toBeTruthy();
    expect(screen.queryByText("Your Review")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Review that game" }));
    expect(await screen.findByText("game page")).toBeTruthy();
  });

  it("gets out of the way when the reader says it is a different game", async () => {
    withMatch();
    fireEvent.click(
      await screen.findByRole("button", { name: /different game/i }),
    );
    expect(await screen.findByText("Your Review")).toBeTruthy();
  });
});

describe("the new game route", () => {
  it("does not ask the API about a source that does not exist", async () => {
    render(
      <MockedProvider mocks={[meMock]}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/games/new/nonsense/1"]}>
            <Routes>
              <Route path="/games/new/:source/:id" element={<NewGamePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </MockedProvider>,
    );
    expect(await screen.findByText("Game not found.")).toBeTruthy();
  });
});
