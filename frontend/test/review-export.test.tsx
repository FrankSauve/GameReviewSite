// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";

/** See profile-views.test.tsx: vitest runs without globals, so this is manual. */
afterEach(cleanup);

import { AuthProvider } from "../src/contexts/AuthContext";
import { GET_ME } from "../src/graphql/mutations";
import { GET_USER_REVIEW_SUMMARIES } from "../src/graphql/queries";
import { ORDER_FOR } from "../src/lib/grouping";
import { UserProfilePage } from "../src/pages/UserProfilePage";

/**
 * The export link is offered on your own profile and nowhere else.
 *
 * The endpoint behind it writes the reviews of whoever is signed in, not of
 * whoever the page is about, so showing it on someone else's profile would
 * download your own reviews under their name — a mistake that produces a
 * plausible-looking file rather than an error.
 */

const ME = {
  __typename: "User",
  id: "u1",
  slug: "simon",
  username: "simon",
  email: null,
};

/**
 * Routed by slug rather than UUID, because the page canonicalises a UUID URL
 * into the slug one and the refetch that follows has no mock behind it. The
 * fixtures give each user a slug equal to their username.
 */
const PROFILES: Record<string, string> = { simon: "u1", "someone-else": "u2" };

function profileMock(username: string, reviewCount: number) {
  return {
    request: {
      query: GET_USER_REVIEW_SUMMARIES,
      variables: { id: username, order: ORDER_FOR.year },
    },
    result: {
      data: {
        user: {
          __typename: "User",
          id: PROFILES[username],
          slug: username,
          username,
          bio: null,
          reviewCount,
          averageRating: 8,
        },
        reviewSummariesByUser: [],
      },
    },
  };
}

const meMock = { request: { query: GET_ME }, result: { data: { me: ME } } };

function renderProfile(username: string, reviewCount = 3) {
  return render(
    <MockedProvider mocks={[meMock, profileMock(username, reviewCount)]}>
      <AuthProvider>
        <MemoryRouter initialEntries={[`/users/${username}`]}>
          <Routes>
            <Route path="/users/:id" element={<UserProfilePage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </MockedProvider>,
  );
}

const exportLink = () => screen.queryByRole("link", { name: "Export as zip" });

describe("the review export link", () => {
  it("points at the backend's export endpoint and asks for a download", async () => {
    renderProfile("simon");
    await waitFor(() => expect(exportLink()).not.toBeNull());
    const link = exportLink() as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/export/reviews.zip");
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("is not offered on somebody else's profile", async () => {
    renderProfile("someone-else");
    await waitFor(() => expect(screen.getByText("someone-else")).toBeTruthy());
    expect(exportLink()).toBeNull();
  });

  /** An empty archive is a confusing thing to hand someone. */
  it("is not offered when there is nothing to export", async () => {
    renderProfile("simon", 0);
    await waitFor(() => expect(screen.getByText("simon")).toBeTruthy());
    expect(exportLink()).toBeNull();
  });
});
