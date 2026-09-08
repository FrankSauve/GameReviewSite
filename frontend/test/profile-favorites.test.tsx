// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/** See profile-views.test.tsx: vitest runs without globals, so RTL registers none. */
afterEach(cleanup);

import { MockedProvider } from "@apollo/client/testing";
import { AuthProvider } from "../src/contexts/AuthContext";
import { GET_ME } from "../src/graphql/mutations";
import {
  GET_USER_FAVORITES,
  GET_USER_REVIEW_SUMMARIES,
} from "../src/graphql/queries";
import { SET_FAVORITE_GAME } from "../src/graphql/mutations";
import { UserProfilePage } from "../src/pages/UserProfilePage";
import { FAVORITE_CATEGORIES } from "../src/lib/favoriteCategories";

const USER_ID = "u1";
const USER_SLUG = "simon";
const ME = {
  __typename: "User",
  id: USER_ID,
  slug: USER_SLUG,
  username: "simon",
  email: null,
  avatarColor: null,
};

const game = (id: string, title: string) => ({
  __typename: "Game",
  id,
  slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  title,
  coverUrl: `https://example.test/${id}.jpg`,
});

const summary = (id: string, gameId: string, title: string) => ({
  __typename: "ReviewSummary",
  id,
  slug: `${USER_SLUG}/${title.toLowerCase()}`,
  rating: 9,
  yearPlayed: 2024,
  hoursPlayed: 12,
  createdAt: "2026-01-01T00:00:00.000Z",
  commentCount: 0,
  game: { ...game(gameId, title), releaseYear: 2015, genres: ["RPG"] },
});

const favorite = (category: string, g: ReturnType<typeof game>) => ({
  __typename: "FavoriteGame",
  id: `f-${category}`,
  category,
  game: g,
});

function summariesMock() {
  return {
    request: {
      query: GET_USER_REVIEW_SUMMARIES,
      variables: { id: USER_SLUG, order: "YEAR_DESC" },
    },
    result: {
      data: {
        user: {
          __typename: "User",
          id: USER_ID,
          slug: USER_SLUG,
          username: "simon",
          avatarColor: null,
          bio: null,
          reviewCount: 2,
          averageRating: 9,
        },
        reviewSummariesByUser: [
          summary("r1", "g1", "Elden Ring"),
          summary("r2", "g2", "Hades"),
        ],
      },
    },
  };
}

function favoritesMock(favorites: unknown[]) {
  return {
    request: { query: GET_USER_FAVORITES, variables: { id: USER_ID } },
    result: {
      data: { user: { __typename: "User", id: USER_ID, favorites } },
    },
  };
}

function setMock(category: string, gameId: string, favorites: unknown[]) {
  return {
    request: {
      query: SET_FAVORITE_GAME,
      variables: { input: { category, gameId } },
    },
    result: {
      data: {
        setFavoriteGame: { __typename: "User", id: USER_ID, favorites },
      },
    },
  };
}

function meMock(user: typeof ME | null) {
  return { request: { query: GET_ME }, result: { data: { me: user } } };
}

function renderFavorites(mocks: readonly unknown[]) {
  return render(
    <MockedProvider mocks={mocks as never}>
      <AuthProvider>
        <MemoryRouter initialEntries={[`/users/${USER_SLUG}/favorites`]}>
          <Routes>
            <Route
              path="/users/:id/favorites"
              element={<UserProfilePage tab="favorites" />}
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </MockedProvider>,
  );
}

describe("the profile favorites grid", () => {
  it("draws every category, in the order the list gives them", async () => {
    renderFavorites([
      meMock(null),
      summariesMock(),
      favoritesMock([favorite("favorite-game", game("g1", "Elden Ring"))]),
    ]);

    await waitFor(() => {
      expect(screen.getByText("Favourite Game")).toBeDefined();
    });
    for (const { label } of FAVORITE_CATEGORIES) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  /** A visitor reads the grid; only the owner edits it. */
  it("offers a visitor no way to pick", async () => {
    renderFavorites([
      meMock(null),
      summariesMock(),
      favoritesMock([favorite("favorite-game", game("g1", "Elden Ring"))]),
    ]);

    await waitFor(() => {
      expect(screen.getByText("Favourite Game")).toBeDefined();
    });
    expect(screen.queryByLabelText(/^Select /)).toBeNull();
    expect(screen.queryByLabelText(/^Change /)).toBeNull();
  });

  it("offers the owner Select on an empty category", async () => {
    renderFavorites([meMock(ME), summariesMock(), favoritesMock([])]);

    await waitFor(() => {
      expect(screen.getByLabelText("Select Favourite Game")).toBeDefined();
    });
    expect(screen.getAllByLabelText(/^Select /)).toHaveLength(
      FAVORITE_CATEGORIES.length,
    );
  });

  /** The issue's explicit requirement: a filled tile stays re-pickable. */
  it("lets the owner change a category that is already filled", async () => {
    const replaced = [favorite("favorite-game", game("g2", "Hades"))];
    renderFavorites([
      meMock(ME),
      summariesMock(),
      favoritesMock([favorite("favorite-game", game("g1", "Elden Ring"))]),
      setMock("favorite-game", "g2", replaced),
    ]);

    const tile = await screen.findByLabelText(
      "Change Favourite Game: Elden Ring",
    );
    fireEvent.click(tile);

    fireEvent.click(await screen.findByRole("button", { name: "Hades" }));

    await waitFor(() => {
      expect(
        screen.getByLabelText("Change Favourite Game: Hades"),
      ).toBeDefined();
    });
  });

  /** Picks come from the account's own reviews, not from a search of everything. */
  it("offers only the games the account has reviewed", async () => {
    renderFavorites([meMock(ME), summariesMock(), favoritesMock([])]);

    fireEvent.click(await screen.findByLabelText("Select Best Story"));

    const dialog = await screen.findByRole("dialog", {
      name: "Pick a game for Best Story",
    });
    const offered = Array.from(dialog.querySelectorAll("li button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(offered).toEqual(["Elden Ring", "Hades"]);
  });

  it("filters the picker to a matching title", async () => {
    renderFavorites([meMock(ME), summariesMock(), favoritesMock([])]);

    fireEvent.click(await screen.findByLabelText("Select Best Story"));
    fireEvent.change(
      await screen.findByLabelText("Filter games for Best Story"),
      { target: { value: "hade" } },
    );

    const dialog = screen.getByRole("dialog", {
      name: "Pick a game for Best Story",
    });
    const offered = Array.from(dialog.querySelectorAll("li button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(offered).toEqual(["Hades"]);
  });
});
