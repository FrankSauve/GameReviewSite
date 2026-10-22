// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { GET_RAWG_GAME } from "../src/graphql/queries";
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
    request: { query: GET_RAWG_GAME, variables: { rawgId: "1" } },
    result: {
      data: {
        rawgGame: {
          __typename: "ExternalGame",
          rawgId: "1",
          title: "Elden Ring",
          coverUrl: null,
          releaseYear: 2022,
          genres: ["RPG"],
          description: "A game.",
          game: game && { __typename: "Game", ...game },
        },
      },
    },
  };
}

function renderAt(game: { id: string; slug: string } | null) {
  render(
    <MockedProvider mocks={[meMock, previewMock(game)]}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/games/new/1"]}>
          <Routes>
            <Route path="/games/new/:rawgId" element={<NewGamePage />} />
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
