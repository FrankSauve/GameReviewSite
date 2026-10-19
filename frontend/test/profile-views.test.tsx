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

import { MockedProvider } from "@apollo/client/testing";
import { GET_USER_REVIEW_SUMMARIES } from "../src/graphql/queries";
import { UserProfilePage } from "../src/pages/UserProfilePage";
import { PROFILE_ROUTES, PROFILE_VIEWS } from "../src/lib/profileViews";

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
  summary("r3", 10, 2019, "Another Great One", ["Puzzle"]),
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
 * under the readable key. A plain `waitFor` for the page to appear resolves on
 * the *first* load and the next line then runs mid-reload, so the assertion has
 * to be the retried condition rather than something that merely precedes it.
 */
async function eventually(assert: () => void): Promise<void> {
  await waitFor(assert);
}

/** Group headings, in the order they appear. */
async function headings(): Promise<string[]> {
  await waitFor(() => expect(screen.getByText("simon")).toBeTruthy());
  await waitFor(() =>
    expect(
      screen.queryAllByRole("heading", { level: 3 }).length,
    ).toBeGreaterThan(0),
  );
  return screen
    .queryAllByRole("heading", { level: 3 })
    .map((h) => h.textContent ?? "");
}

describe("profile grouped views", () => {
  it("groups by year at the bare profile route", async () => {
    renderAt(`/users/${USER_ID}`);
    expect(await headings()).toEqual(["2024", "2019"]);
  });

  it("groups by year at the explicit by-year route", async () => {
    renderAt(`/users/${USER_ID}/by-year`);
    expect(await headings()).toEqual(["2024", "2019"]);
  });

  it("groups by score at the by-score route", async () => {
    renderAt(`/users/${USER_ID}/by-score`);
    expect(await headings()).toEqual(["10", "8.5"]);
  });

  /** The recent view is one undivided list, so it has no group headings at all. */
  it("shows no group headings on the recent route", async () => {
    renderAt(`/users/${USER_ID}/recent`);
    await waitFor(() => expect(screen.getByText("simon")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Best Game")).toBeTruthy());
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("puts two reviews sharing a year under one heading", async () => {
    renderAt(`/users/${USER_ID}/by-year`);
    await headings();
    expect(screen.getByText("Older Game")).toBeTruthy();
    expect(screen.getByText("Another Great One")).toBeTruthy();
  });

  it("groups by genre at the by-genre route, most games first", async () => {
    renderAt(`/users/${USER_ID}/by-genre`);
    expect(await headings()).toEqual(["Action", "Puzzle", "RPG"]);
  });

  it("marks Reviews as the current section on a review view", async () => {
    renderAt(`/users/${USER_ID}/by-score`);
    await eventually(() => {
      expect(screen.getByRole("link", { current: "page" }).textContent).toBe(
        "Reviews",
      );
      expect(
        screen.getByRole("link", { name: "Favourites" }).getAttribute("href"),
      ).toBe(`/users/${USER_SLUG}/favorites`);
    });
  });

  it("shows the current view in the Sort by menu", async () => {
    renderAt(`/users/${USER_ID}/by-genre`);
    await eventually(() => {
      expect(
        (screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement)
          .value,
      ).toBe("genre");
    });
  });

  it("moves to each view's own route from the Sort by menu", async () => {
    renderAt(`/users/${USER_SLUG}`);
    await headings();
    const expected: Record<string, string> = {
      year: `/users/${USER_SLUG}`,
      score: `/users/${USER_SLUG}/by-score`,
      genre: `/users/${USER_SLUG}/by-genre`,
      recent: `/users/${USER_SLUG}/recent`,
    };
    // Year last, so it is a real change from the view before it.
    for (const grouping of ["score", "genre", "recent", "year"]) {
      fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), {
        target: { value: grouping },
      });
      await eventually(() => {
        expect(pathname()).toBe(expected[grouping]);
        expect(
          (
            screen.getByRole("combobox", {
              name: "Sort by",
            }) as HTMLSelectElement
          ).value,
        ).toBe(grouping);
      });
    }
    expect(Object.keys(expected).sort()).toEqual(
      PROFILE_VIEWS.map((v) => v.grouping).sort(),
    );
  });

  /**
   * Arrowing through a closed select fires a change per step in Chrome. If the
   * page swapped to its skeleton while the next view loaded, the menu would
   * unmount under the keyboard and focus would fall to the body.
   */
  it("keeps the Sort by menu focused while the next view loads", async () => {
    renderAt(`/users/${USER_SLUG}`, { slowScore: true });
    expect(await headings()).toEqual(["2024", "2019"]);
    const select = screen.getByRole("combobox", { name: "Sort by" });
    select.focus();

    fireEvent.change(select, { target: { value: "score" } });

    await eventually(() => {
      expect(pathname()).toBe(`/users/${USER_SLUG}/by-score`);
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
    expect(screen.getByRole("combobox", { name: "Sort by" })).toBe(select);
    expect(document.activeElement).toBe(select);

    await eventually(() => {
      expect(
        screen
          .queryAllByRole("heading", { level: 3 })
          .map((h) => h.textContent),
      ).toEqual(["10", "8.5"]);
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    });
    expect(document.activeElement).toBe(select);
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
    expect(
      (screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement)
        .value,
    ).toBe("score");
  });

  it("renders no body text, because the query does not fetch one", async () => {
    renderAt(`/users/${USER_ID}/by-year`);
    await headings();
    // Each row links to the review rather than showing an excerpt of it.
    expect(
      screen.getByText("Best Game").closest("a")?.getAttribute("href"),
    ).toBe(`/reviews/${USER_SLUG}/best-game`);
  });
});
