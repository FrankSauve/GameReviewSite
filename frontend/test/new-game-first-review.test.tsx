// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing/react";
import type { MockedResponse } from "@apollo/client/testing";
import { GET_EXTERNAL_GAME } from "../src/graphql/queries";
import { GET_ME } from "../src/graphql/mutations";
import { AuthProvider } from "../src/contexts/AuthContext";
import { NewGamePage } from "../src/pages/NewGamePage";
import { OldNewGamePath } from "../src/pages/OldNewGamePath";

/** See profile-views.test.tsx: vitest runs without globals, so this is manual. */
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
        email: null,
      },
    },
  },
};

const signedOut = {
  request: { query: GET_ME },
  result: { data: { me: null } },
};

function previewMock(
  game: { id: string; slug: string } | null,
  source = "TGDB",
) {
  return {
    request: {
      query: GET_EXTERNAL_GAME,
      variables: { source, id: "1" },
    },
    result: {
      data: {
        externalGame: {
          __typename: "ExternalGame",
          source,
          externalId: "1",
          title: "Elden Ring",
          coverUrl: null,
          posterUrl: null,
          bannerUrl: null,
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
        <MemoryRouter initialEntries={["/games/new/tgdb/1"]}>
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
  it("shows the source's title above the review form", async () => {
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
          <MemoryRouter initialEntries={["/games/new/tgdb/1"]}>
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
    expect(
      await screen.findByRole("heading", { name: "Your Review" }),
    ).toBeTruthy();
  });
});

describe("moving from one new game to the next", () => {
  const matched = (id: string) => {
    const preview = previewMock(null);
    return {
      request: {
        query: GET_EXTERNAL_GAME,
        variables: { source: "TGDB", id },
      },
      result: {
        data: {
          externalGame: {
            ...preview.result.data.externalGame,
            externalId: id,
            libraryMatch: {
              __typename: "Game",
              id: "g1",
              slug: "doom",
              title: "Doom",
              releaseYear: 2016,
            },
          },
        },
      },
    };
  };

  it("asks again, though the route kept the page mounted", async () => {
    render(
      <MockedProvider mocks={[meMock, matched("1"), matched("2")]}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/games/new/tgdb/1"]}>
            <Link to="/games/new/tgdb/2">next game</Link>
            <Routes>
              <Route path="/games/new/:source/:id" element={<NewGamePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </MockedProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /different game/i }),
    );
    expect(
      await screen.findByRole("heading", { name: "Your Review" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "next game" }));
    expect(await screen.findByText(/already in the library/i)).toBeTruthy();
    expect(screen.queryByText("Your Review")).toBeNull();
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

describe("a new game link opened signed out", () => {
  it("offers sign-in, and does not ask the API for the game", async () => {
    render(
      <MockedProvider mocks={[signedOut]}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/games/new/steam/1"]}>
            <Routes>
              <Route path="/games/new/:source/:id" element={<NewGamePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </MockedProvider>,
    );
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Sign in to add this game.")).toBeTruthy();
  });
});

describe("a new game link opened after the session ended", () => {
  it("offers sign-in rather than the API's refusal", async () => {
    const refused = {
      request: {
        query: GET_EXTERNAL_GAME,
        variables: { source: "TGDB", id: "1" },
      },
      result: {
        errors: [
          {
            message: "You must be signed in to do that.",
            extensions: { code: "UNAUTHENTICATED" },
          },
        ],
      },
    };
    render(
      <MockedProvider mocks={[meMock, refused]}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/games/new/tgdb/1"]}>
            <Routes>
              <Route path="/games/new/:source/:id" element={<NewGamePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </MockedProvider>,
    );
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("You must be signed in to do that.")).toBeNull();
  });
});

describe("a link from before game sources", () => {
  function openOldLink(mocks: MockedResponse[]) {
    render(
      <MockedProvider mocks={[meMock, ...mocks]}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/games/new/1"]}>
            <Routes>
              <Route path="/games/new/:id" element={<OldNewGamePath />} />
              <Route path="/games/new/:source/:id" element={<NewGamePage />} />
              <Route path="/games/:id" element={<p>game page</p>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </MockedProvider>,
    );
  }

  it("lands on the game stored under that RAWG id", async () => {
    openOldLink([previewMock({ id: "g1", slug: "elden-ring" }, "RAWG")]);
    expect(await screen.findByText("game page")).toBeTruthy();
  });

  it("says the game is not found when the library never stored it", async () => {
    openOldLink([
      {
        request: {
          query: GET_EXTERNAL_GAME,
          variables: { source: "RAWG", id: "1" },
        },
        result: { data: { externalGame: null } },
      },
    ]);
    expect(await screen.findByText("Game not found.")).toBeTruthy();
  });
});
