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

/**
 * Explicit cleanup: @testing-library/react only registers its own afterEach when
 * the test runner exposes globals, and this project runs vitest without them. Left
 * out, each render stacks on the last and every query finds several matches.
 */
afterEach(cleanup);

import { MockedProvider } from "@apollo/client/testing/react";
import { GET_USER_REVIEW_SUMMARIES } from "../src/graphql/queries";
import { UserProfilePage } from "../src/pages/UserProfilePage";
import { PROFILE_ROUTES, PROFILE_TABS } from "../src/lib/profileViews";

/**
 * Several routes render one component with a different `tab` prop, which is
 * exactly the arrangement that breaks silently: the page still renders, just
 * grouped along the wrong axis and asking the server for the wrong ordering.
 */
const USER_ID = "u1";
const USER_SLUG = "simon";

const summary = (
  id: string,
  rating: number,
  yearPlayed: number | null,
  title: string,
  genres: string[],
) => ({
  __typename: "ReviewSummary",
  id,
  slug: `${USER_SLUG}/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  rating,
  yearPlayed,
  hoursPlayed: 12,
  genre: null,
  secondaryGenres: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  commentCount: 0,
  game: {
    __typename: "Game",
    id: `g-${id}`,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    coverUrl: null,
    releaseYear: 2015,
    genres,
  },
});

const ROWS = [
  summary("r1", 10, 2024, "Best Game", ["RPG", "Action"]),
  summary("r2", 8.5, 2019, "Older Game", ["Action"]),
  {
    ...summary("r3", 10, 2019, "Another Great One", ["Puzzle"]),
    secondaryGenres: ["Horror"],
  },
];

function mockFor(order: string, id: string = USER_ID, delay = 0) {
  return {
    delay,
    request: {
      query: GET_USER_REVIEW_SUMMARIES,
      variables: { id, order },
    },
    result: {
      data: {
        user: {
          __typename: "User",
          id: USER_ID,
          slug: USER_SLUG,
          username: "simon",
          // Every field GET_USER_REVIEW_SUMMARIES asks for. Apollo writes an
          // incomplete result for a mock missing one, and the page then never
          // leaves its loading skeleton.
          avatarColor: null,
          bio: null,
          reviewCount: 3,
          averageRating: 9.5,
        },
        reviewSummariesByUser: ROWS,
      },
    },
  };
}

function Pathname() {
  return <output data-testid="pathname">{useLocation().pathname}</output>;
}

function pathname(): string {
  return screen.getByTestId("pathname").textContent ?? "";
}

/** `slowScore` holds the by-score response back, to watch the page mid-load. */
function renderAt(path: string, { slowScore = false } = {}) {
  // No AuthContext.Provider: the context's own default is an anonymous viewer,
  // which is what these tests want.
  return render(
    <MockedProvider
      mocks={[
        mockFor("YEAR_DESC"),
        mockFor("RATING_DESC"),
        mockFor("RECENT"),
        // The same three again under the slug, for after the canonical redirect
        // has swapped the UUID out of the URL.
        mockFor("YEAR_DESC", USER_SLUG),
        mockFor("RATING_DESC", USER_SLUG, slowScore ? 100 : 0),
        mockFor("RECENT", USER_SLUG),
      ]}
    >
      <MemoryRouter initialEntries={[path]}>
        <Pathname />
        {/* The app's own route table, so a view missing from it fails here. */}
        <Routes>
          {PROFILE_ROUTES.filter(({ tab }) => tab !== "favorites").map(
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
    </MockedProvider>,
  );
}

/**
 * Runs `assert` until it holds.
 *
 * Rendering at a UUID URL rewrites it to the slug, which re-runs the query
 * under the readable key and drops the page back to its loading skeleton for a
 * tick. A plain `waitFor` for the tabs to appear resolves on the *first* load and
 * the next line then runs against the skeleton, so the assertion has to be the
 * retried condition rather than something that merely precedes it.
 */
async function eventually(assert: () => void): Promise<void> {
  await waitFor(assert);
}

/** Waits until the group headings read `expected`, in order. */
async function expectHeadings(expected: string[]): Promise<void> {
  await eventually(() =>
    expect(
      screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(expected),
  );
}

describe("profile grouped views", () => {
  it("groups by year at the bare profile route", async () => {
    renderAt(`/users/${USER_ID}`);
    await expectHeadings(["2024", "2019"]);
  });

  it("groups by year at the explicit by-year route", async () => {
    renderAt(`/users/${USER_ID}/by-year`);
    await expectHeadings(["2024", "2019"]);
  });

  it("groups by score at the by-score route", async () => {
    renderAt(`/users/${USER_ID}/by-score`);
    await expectHeadings(["10", "8.5"]);
  });

  /** The recent view is one undivided list, so it has no group headings at all. */
  it("shows no group headings on the recent route", async () => {
    renderAt(`/users/${USER_ID}/recent`);
    await eventually(() => {
      expect(pathname()).toBe(`/users/${USER_SLUG}/recent`);
      expect(screen.getByText("Best Game")).toBeTruthy();
    });
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("puts two reviews sharing a year under one heading", async () => {
    renderAt(`/users/${USER_ID}/by-year`);
    await eventually(() => {
      expect(screen.getByText("Older Game")).toBeTruthy();
      expect(screen.getByText("Another Great One")).toBeTruthy();
    });
  });

  it("groups by genre at the by-genre route, most games first", async () => {
    renderAt(`/users/${USER_ID}/by-genre`);
    await expectHeadings(["Action", "Puzzle"]);
  });

  /** Secondary genres filter the profile; they never add a heading. */
  it("leaves the genre headings to each review's one genre", async () => {
    renderAt(`/users/${USER_ID}/by-genre`);
    await expectHeadings(["Action", "Puzzle"]);
  });

  it("marks the tab of the view being shown", async () => {
    renderAt(`/users/${USER_ID}/by-genre`);
    await eventually(() =>
      expect(screen.getByRole("link", { current: "page" }).textContent).toBe(
        "Genre",
      ),
    );
  });

  it("lays the tabs out in order, each linking to its own route", async () => {
    renderAt(`/users/${USER_SLUG}`);
    await expectHeadings(["2024", "2019"]);
    const tabs = screen
      .getAllByRole("link")
      .filter((a) => PROFILE_TABS.some((t) => t.label === a.textContent));
    expect(tabs.map((a) => a.textContent)).toEqual([
      "Year",
      "Score",
      "Genre",
      "Recent",
      "Favourites",
    ]);
    expect(tabs.map((a) => a.getAttribute("href"))).toEqual([
      `/users/${USER_SLUG}`,
      `/users/${USER_SLUG}/by-score`,
      `/users/${USER_SLUG}/by-genre`,
      `/users/${USER_SLUG}/recent`,
      `/users/${USER_SLUG}/favorites`,
    ]);
  });

  it("switches view from a tab", async () => {
    renderAt(`/users/${USER_SLUG}`);
    await expectHeadings(["2024", "2019"]);
    fireEvent.click(screen.getByRole("link", { name: "Score" }));
    await eventually(() => {
      expect(pathname()).toBe(`/users/${USER_SLUG}/by-score`);
      expect(
        screen
          .queryAllByRole("heading", { level: 3 })
          .map((h) => h.textContent),
      ).toEqual(["10", "8.5"]);
    });
  });

  /** Score and Genre share a cache entry, so the list is not remounted by a load. */
  it("opens every group again after a round trip through another view", async () => {
    renderAt(`/users/${USER_SLUG}/by-score`);
    await expectHeadings(["10", "8.5"]);
    fireEvent.click(screen.getByRole("button", { name: "10" }));
    expect(
      screen.getByRole("button", { name: "10" }).getAttribute("aria-expanded"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("link", { name: "Genre" }));
    await eventually(() =>
      expect(pathname()).toBe(`/users/${USER_SLUG}/by-genre`),
    );
    fireEvent.click(screen.getByRole("link", { name: "Score" }));
    await eventually(() =>
      expect(
        screen
          .getByRole("button", { name: "10" })
          .getAttribute("aria-expanded"),
      ).toBe("true"),
    );
  });

  /**
   * Swapping the whole page for its skeleton would unmount the tab just
   * activated, dropping keyboard focus to the body, and a bio being edited.
   */
  it("keeps the header and tabs while the next view loads", async () => {
    renderAt(`/users/${USER_SLUG}`, { slowScore: true });
    await expectHeadings(["2024", "2019"]);
    const scoreTab = screen.getByRole("link", { name: "Score" });
    scoreTab.focus();

    fireEvent.click(scoreTab);

    await eventually(() => {
      expect(pathname()).toBe(`/users/${USER_SLUG}/by-score`);
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
    // The list is a skeleton, not the previous view's rows regrouped.
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "simon" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Score" })).toBe(scoreTab);
    expect(document.activeElement).toBe(scoreTab);

    await eventually(() => {
      expect(
        screen
          .queryAllByRole("heading", { level: 3 })
          .map((h) => h.textContent),
      ).toEqual(["10", "8.5"]);
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    });
    expect(document.activeElement).toBe(scoreTab);
  });

  /**
   * A profile link shared before slugs existed still resolves, and does not stay
   * a UUID once it has: the page rewrites the address bar in place, keeping
   * whichever view tab the visitor arrived on.
   */
  it("rewrites a UUID profile URL to the slug", async () => {
    renderAt(`/users/${USER_ID}/by-score`);
    await waitFor(() => expect(screen.getByText(USER_SLUG)).toBeTruthy());
    await eventually(() =>
      expect(pathname()).toBe(`/users/${USER_SLUG}/by-score`),
    );
    // Still the by-score view, not bounced back to the default.
    expect(screen.getByRole("link", { current: "page" }).textContent).toBe(
      "Score",
    );
  });

  it("renders no body text, because the query does not fetch one", async () => {
    renderAt(`/users/${USER_ID}/by-year`);
    // Each row links to the review rather than showing an excerpt of it.
    await eventually(() =>
      expect(
        screen.getByText("Best Game").closest("a")?.getAttribute("href"),
      ).toBe(`/reviews/${USER_SLUG}/best-game`),
    );
  });
});

describe("filtering a profile by genre", () => {
  const filter = () =>
    screen.getByRole("combobox", {
      name: "Filter by genre",
    }) as HTMLSelectElement;

  it("offers each heading and secondary genre, most reviews first", async () => {
    renderAt(`/users/${USER_SLUG}`);
    await expectHeadings(["2024", "2019"]);
    expect([...filter().options].map((o) => o.textContent)).toEqual([
      "All genres",
      "Action",
      "Horror",
      "Puzzle",
    ]);
  });

  it("keeps a review whose secondary genre matches, ignoring case", async () => {
    renderAt(`/users/${USER_SLUG}?genre=horror`);
    await expectHeadings(["2019"]);
    expect(screen.getByText("Another Great One")).toBeTruthy();
    expect(screen.queryByText("Older Game")).toBeNull();
    expect(filter().value).toBe("Horror");
  });

  /** Best Game has RPG from RAWG but is filed under Action, so RPG matches nothing. */
  it("matches the heading a review sits under, not every genre its game has", async () => {
    renderAt(`/users/${USER_SLUG}/by-score?genre=RPG`);
    await eventually(() =>
      expect(screen.getByText("No reviews under RPG.")).toBeTruthy(),
    );
  });

  it("carries the filter to the other review tabs, not to favourites", async () => {
    renderAt(`/users/${USER_SLUG}/by-score?genre=Action`);
    await expectHeadings(["10", "8.5"]);
    const hrefs = screen
      .getAllByRole("link")
      .filter((a) => PROFILE_TABS.some((t) => t.label === a.textContent))
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      `/users/${USER_SLUG}?genre=Action`,
      `/users/${USER_SLUG}/by-score?genre=Action`,
      `/users/${USER_SLUG}/by-genre?genre=Action`,
      `/users/${USER_SLUG}/recent?genre=Action`,
      `/users/${USER_SLUG}/favorites`,
    ]);
    fireEvent.click(screen.getByRole("link", { name: "Year" }));
    await expectHeadings(["2024", "2019"]);
    expect(screen.queryByText("Another Great One")).toBeNull();
  });

  it("narrows and widens the list from the menu", async () => {
    renderAt(`/users/${USER_SLUG}/by-genre`);
    await expectHeadings(["Action", "Puzzle"]);
    fireEvent.change(filter(), { target: { value: "Horror" } });
    await expectHeadings(["Puzzle"]);
    fireEvent.change(filter(), { target: { value: "" } });
    await expectHeadings(["Action", "Puzzle"]);
  });
});
