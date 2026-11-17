// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

/** See profile-views.test.tsx: vitest runs without globals, so RTL registers none. */
afterEach(cleanup);

import { MockedProvider } from "@apollo/client/testing/react";
import { AuthProvider } from "../src/contexts/AuthContext";
import { GET_ME, SET_YEAR_AWARDS } from "../src/graphql/mutations";
import {
  GET_USER_AWARD_YEARS,
  GET_USER_AWARDS,
  GET_USER_REVIEW_SUMMARIES,
} from "../src/graphql/queries";
import { UserProfilePage } from "../src/pages/UserProfilePage";
import { PROFILE_ROUTES } from "../src/lib/profileViews";

const USER_ID = "u1";
const USER_SLUG = "simon";
const ME = {
  __typename: "User",
  id: USER_ID,
  slug: USER_SLUG,
  username: "simon",
  email: null,
  avatarColor: null,
  theme: null,
  palette: null,
};

const game = (id: string, title: string) => ({
  __typename: "Game",
  id,
  slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  title,
  coverUrl: null,
  posterUrl: null,
});

const summary = (gameId: string, title: string, yearPlayed: number) => ({
  __typename: "ReviewSummary",
  id: `r-${gameId}`,
  slug: `${USER_SLUG}/${gameId}`,
  rating: 9,
  yearPlayed,
  hoursPlayed: 12,
  genre: null,
  secondaryGenres: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  commentCount: 0,
  game: {
    ...game(gameId, title),
    releaseYear: 2015,
    genres: ["RPG"],
    communityGenres: [],
  },
});

const ELDEN = game("g1", "Elden Ring");
const HADES = game("g2", "Hades");
const CELESTE = game("g3", "Celeste");

function summariesMock() {
  return {
    request: {
      query: GET_USER_REVIEW_SUMMARIES,
      variables: { id: USER_SLUG, order: "YEAR_DESC", limit: 500, offset: 0 },
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
          reviewCount: 3,
          averageRating: 9,
          hoursPlayed: 24,
        },
        reviewSummariesByUser: [
          summary("g1", "Elden Ring", 2024),
          summary("g2", "Hades", 2024),
          summary("g3", "Celeste", 2022),
        ],
      },
    },
  };
}

function yearsMock(awardYears: number[]) {
  return {
    request: { query: GET_USER_AWARD_YEARS, variables: { id: USER_ID } },
    result: { data: { user: { __typename: "User", id: USER_ID, awardYears } } },
  };
}

interface Picks {
  ranking?: ReturnType<typeof game>[];
  categories?: [string, ReturnType<typeof game>][];
}

function yearAwards(year: number, { ranking = [], categories = [] }: Picks) {
  return {
    __typename: "YearAwards",
    id: `${USER_ID}:${year}`,
    year,
    ranking: ranking.map((g, i) => ({
      __typename: "AwardRank",
      id: `rank-${year}-${i}`,
      rank: i + 1,
      game: g,
    })),
    categories: categories.map(([name, g], i) => ({
      __typename: "AwardCategory",
      id: `cat-${year}-${i}`,
      name,
      game: g,
    })),
  };
}

function awardsMock(year: number, picks: Picks) {
  return {
    request: { query: GET_USER_AWARDS, variables: { id: USER_ID, year } },
    result: {
      data: {
        user: {
          __typename: "User",
          id: USER_ID,
          awards: yearAwards(year, picks),
        },
      },
    },
  };
}

function meMock(user: typeof ME | null) {
  return { request: { query: GET_ME }, result: { data: { me: user } } };
}

function Pathname() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function renderAwards(path: string, mocks: readonly unknown[]) {
  return render(
    <MockedProvider mocks={mocks as never}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Pathname />
          <Routes>
            {PROFILE_ROUTES.filter(({ tab }) => tab === "awards").map(
              ({ path: route, tab }) => (
                <Route
                  key={route}
                  path={route}
                  element={<UserProfilePage tab={tab} />}
                />
              ),
            )}
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </MockedProvider>,
  );
}

describe("the profile awards tab", () => {
  it("opens on the newest year with awards and shows the game of the year first", async () => {
    renderAwards(`/users/${USER_SLUG}/awards`, [
      meMock(null),
      summariesMock(),
      yearsMock([2022]),
      awardsMock(2022, {
        ranking: [CELESTE],
        categories: [["Best Music", CELESTE]],
      }),
    ]);

    expect(await screen.findByText(/Game of the Year 2022/)).toBeDefined();
    expect(screen.getByText("Best Music")).toBeDefined();
    expect(
      (screen.getByLabelText("Awards year") as HTMLSelectElement).value,
    ).toBe("2022");
  });

  it("offers the year as an image to download", async () => {
    renderAwards(`/users/${USER_SLUG}/awards/2022`, [
      meMock(null),
      summariesMock(),
      yearsMock([2022]),
      awardsMock(2022, { ranking: [CELESTE] }),
    ]);

    const link = await screen.findByRole("link", { name: "Download image" });
    expect(link.getAttribute("href")).toBe(
      `/users/${USER_SLUG}/awards/2022.png`,
    );
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("offers no image for a year with nothing in it", async () => {
    renderAwards(`/users/${USER_SLUG}/awards/2024`, [
      meMock(null),
      summariesMock(),
      yearsMock([]),
      awardsMock(2024, {}),
    ]);

    expect(await screen.findByText("No awards for 2024.")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Download image" })).toBeNull();
  });

  it("numbers the runners-up after the game of the year", async () => {
    renderAwards(`/users/${USER_SLUG}/awards/2024`, [
      meMock(null),
      summariesMock(),
      yearsMock([2024]),
      awardsMock(2024, { ranking: [ELDEN, HADES] }),
    ]);

    const runnersUp = await screen.findByRole("region", {
      name: "Runners-up",
    });
    expect(runnersUp.textContent).toContain("2");
    expect(runnersUp.textContent).toContain("Hades");
    expect(runnersUp.textContent).not.toContain("Elden Ring");
  });

  /** Played years are the owner's to fill in, not empty pages for a visitor. */
  it("offers a visitor only the years that have awards", async () => {
    renderAwards(`/users/${USER_SLUG}/awards`, [
      meMock(null),
      summariesMock(),
      yearsMock([2022]),
      awardsMock(2022, { ranking: [CELESTE] }),
    ]);

    const menu = await screen.findByLabelText("Awards year");
    expect([...menu.querySelectorAll("option")].map((o) => o.value)).toEqual([
      "2022",
    ]);
  });

  it("tells a visitor there are no awards when no year has any", async () => {
    renderAwards(`/users/${USER_SLUG}/awards`, [
      meMock(null),
      summariesMock(),
      yearsMock([]),
    ]);

    expect(await screen.findByText("No awards yet.")).toBeDefined();
    expect(screen.queryByLabelText("Awards year")).toBeNull();
  });

  it("offers a visitor no way to edit", async () => {
    renderAwards(`/users/${USER_SLUG}/awards/2024`, [
      meMock(null),
      summariesMock(),
      yearsMock([]),
      awardsMock(2024, {}),
    ]);

    expect(await screen.findByText("No awards for 2024.")).toBeDefined();
    expect(screen.queryByRole("button", { name: /awards/ })).toBeNull();
  });

  it("switches year from the menu", async () => {
    renderAwards(`/users/${USER_SLUG}/awards/2024`, [
      meMock(null),
      summariesMock(),
      yearsMock([2024, 2022]),
      awardsMock(2024, { ranking: [ELDEN] }),
      awardsMock(2022, { ranking: [CELESTE] }),
    ]);

    // A visitor's years come from awardYears, so wait for it to arrive.
    await screen.findByRole("option", { name: "2022" });
    fireEvent.change(screen.getByLabelText("Awards year"), {
      target: { value: "2022" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("path").textContent).toBe(
        `/users/${USER_SLUG}/awards/2022`,
      );
    });
    expect(await screen.findByText(/Game of the Year 2022/)).toBeDefined();
  });

  it("lets the owner pick a game of the year from that year's games and save", async () => {
    renderAwards(`/users/${USER_SLUG}/awards/2024`, [
      meMock(ME),
      summariesMock(),
      yearsMock([]),
      awardsMock(2024, {}),
      {
        request: {
          query: SET_YEAR_AWARDS,
          variables: {
            input: {
              year: 2024,
              ranking: ["g2"],
              categories: [{ name: "Best Boss", gameId: "g1" }],
            },
          },
        },
        result: {
          data: {
            setYearAwards: yearAwards(2024, {
              ranking: [HADES],
              categories: [["Best Boss", ELDEN]],
            }),
          },
        },
      },
    ]);

    fireEvent.click(
      await screen.findByRole("button", { name: "Pick your 2024 awards" }),
    );

    const add = screen.getByLabelText("Add a game to the ranking");
    const offered = [...add.querySelectorAll("option")]
      .map((o) => o.textContent)
      .slice(1);
    // Celeste was played in 2022, so it is not eligible here.
    expect(offered).toEqual(["Elden Ring", "Hades"]);
    fireEvent.change(add, { target: { value: "g2" } });

    fireEvent.click(screen.getByRole("button", { name: "Add an award" }));
    fireEvent.change(screen.getByLabelText("Award 1 name"), {
      target: { value: "Best Boss" },
    });
    fireEvent.change(screen.getByLabelText("Winner of award 1"), {
      target: { value: "g1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Game of the Year 2024/)).toBeDefined();
    expect(screen.getByText("Best Boss")).toBeDefined();
    expect(
      [...screen.getByLabelText("Awards year").querySelectorAll("option")].map(
        (o) => o.value,
      ),
    ).toEqual(["2024", "2022"]);
  });

  it("puts the default year in the URL before editing it", async () => {
    renderAwards(`/users/${USER_SLUG}/awards`, [
      meMock(ME),
      summariesMock(),
      yearsMock([]),
      awardsMock(2024, {}),
    ]);

    fireEvent.click(
      await screen.findByRole("button", { name: "Pick your 2024 awards" }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("path").textContent).toBe(
        `/users/${USER_SLUG}/awards/2024`,
      );
    });
    expect(screen.getByLabelText("Add a game to the ranking")).toBeDefined();
  });

  it("opens on the default year when the URL names one out of range", async () => {
    renderAwards(`/users/${USER_SLUG}/awards/1900`, [
      meMock(null),
      summariesMock(),
      yearsMock([2022]),
      awardsMock(2022, { ranking: [CELESTE] }),
    ]);

    expect(await screen.findByText(/Game of the Year 2022/)).toBeDefined();
    await waitFor(() => {
      expect(screen.getByTestId("path").textContent).toBe(
        `/users/${USER_SLUG}/awards`,
      );
    });
  });

  it("holds the save until every award has a winner", async () => {
    renderAwards(`/users/${USER_SLUG}/awards/2024`, [
      meMock(ME),
      summariesMock(),
      yearsMock([]),
      awardsMock(2024, {}),
    ]);

    fireEvent.click(
      await screen.findByRole("button", { name: "Pick your 2024 awards" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add an award" }));
    fireEvent.change(screen.getByLabelText("Award 1 name"), {
      target: { value: "Best Boss" },
    });
    expect(screen.getByRole("alert").textContent).toContain("Pick a winner");
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
