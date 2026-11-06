// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import { SEARCH_GAMES_EXTERNAL } from "../src/graphql/queries";
import { AddGameButton } from "../src/components/AddGameButton";

/** See profile-views.test.tsx: vitest runs without globals, so this is manual. */
afterEach(cleanup);

const row = (source: string, externalId: string, title: string) => ({
  __typename: "ExternalGame",
  source,
  externalId,
  title,
  coverUrl: null,
  releaseYear: null,
  genres: [],
  metacritic: null,
  game: null,
});

const answer = (scope: string, games: object[]) => ({
  request: {
    query: SEARCH_GAMES_EXTERNAL,
    variables: { query: "metroid dread", scope },
  },
  result: { data: { searchGamesExternal: games } },
});

function searchForMetroid() {
  render(
    <MockedProvider
      mocks={[
        answer("DEFAULT", [row("STEAM", "1", "Scrapland Remastered")]),
        answer("EVERYWHERE", [row("TGDB", "87675", "Metroid Dread")]),
      ]}
    >
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<AddGameButton />} />
          <Route path="/games/new/:source/:id" element={<p>new game page</p>} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /add game/i }));
  fireEvent.change(screen.getByPlaceholderText(/find a game/i), {
    target: { value: "metroid dread" },
  });
}

describe("searching everywhere from Add game", () => {
  it("reaches a console game Steam answered wrongly, and opens it", async () => {
    searchForMetroid();
    await screen.findByText("Scrapland Remastered");

    fireEvent.click(screen.getByRole("button", { name: /search everywhere/i }));
    fireEvent.click(await screen.findByText("Metroid Dread"));
    expect(await screen.findByText("new game page")).toBeTruthy();
  });

  it("stops offering the link once it has been used", async () => {
    searchForMetroid();
    fireEvent.click(
      await screen.findByRole("button", { name: /search everywhere/i }),
    );
    await screen.findByText("Metroid Dread");
    expect(
      screen.queryByRole("button", { name: /search everywhere/i }),
    ).toBeNull();
  });
});
