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

const answer = (scope: string, games: object[], query = "metroid dread") => ({
  request: {
    query: SEARCH_GAMES_EXTERNAL,
    variables: { query, scope },
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

  it("says where each result came from", async () => {
    searchForMetroid();
    await screen.findByText("Scrapland Remastered");
    expect(screen.getByText("Steam")).toBeTruthy();
  });

  it("offers the link again when searching everywhere fails", async () => {
    render(
      <MockedProvider
        mocks={[
          answer("DEFAULT", [row("STEAM", "1", "Scrapland Remastered")]),
          {
            request: {
              query: SEARCH_GAMES_EXTERNAL,
              variables: { query: "metroid dread", scope: "EVERYWHERE" },
            },
            result: { errors: [{ message: "Game search is down." }] },
          },
        ]}
      >
        <MemoryRouter>
          <AddGameButton />
        </MemoryRouter>
      </MockedProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /add game/i }));
    fireEvent.change(screen.getByPlaceholderText(/find a game/i), {
      target: { value: "metroid dread" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /search everywhere/i }),
    );
    expect(await screen.findByText("Game search is down.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /search everywhere/i }),
    ).toBeTruthy();
  });

  it("keeps the link when the other sources added nothing", async () => {
    render(
      <MockedProvider
        mocks={[
          answer("DEFAULT", [row("STEAM", "1", "Scrapland Remastered")]),
          answer("EVERYWHERE", [row("STEAM", "1", "Scrapland Remastered")]),
        ]}
      >
        <MemoryRouter>
          <AddGameButton />
        </MemoryRouter>
      </MockedProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /add game/i }));
    fireEvent.change(screen.getByPlaceholderText(/find a game/i), {
      target: { value: "metroid dread" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /search everywhere/i }),
    );
    expect(
      await screen.findByRole("button", { name: /search everywhere/i }),
    ).toBeTruthy();
  });
});

describe("a search result already in the library", () => {
  it("shows the poster the library has, not the source's search art", async () => {
    const { container } = render(
      <MockedProvider
        mocks={[
          answer(
            "DEFAULT",
            [
              {
                ...row("STEAM", "2183900", "Space Marine 2"),
                coverUrl: "https://x.test/search-logo.jpg",
                game: {
                  __typename: "Game",
                  id: "g1",
                  slug: "space-marine-2",
                  reviewCount: 3,
                  posterUrl: "https://x.test/poster.jpg",
                },
              },
            ],
            "space marine 2",
          ),
        ]}
      >
        <MemoryRouter>
          <AddGameButton />
        </MemoryRouter>
      </MockedProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /add game/i }));
    fireEvent.change(screen.getByPlaceholderText(/find a game/i), {
      target: { value: "space marine 2" },
    });
    await screen.findByText("Space Marine 2");
    expect(
      container.ownerDocument.querySelector("li img")?.getAttribute("src"),
    ).toBe("https://x.test/poster.jpg");
  });
});
