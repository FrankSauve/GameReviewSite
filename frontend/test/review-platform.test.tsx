// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import { AddReviewForm } from "../src/components/AddReviewForm";
import { CREATE_REVIEW, GET_ME } from "../src/graphql/mutations";
import { AuthProvider } from "../src/contexts/AuthContext";
import { PLATFORMS } from "../src/lib/platforms";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
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
        email: "alice@example.com",
      },
    },
  },
};

function createMock(platform: string | null) {
  return {
    request: {
      query: CREATE_REVIEW,
      variables: {
        input: {
          gameId: "g1",
          rating: 8,
          content: "Played it.",
          yearPlayed: new Date().getFullYear(),
          hoursPlayed: 12,
          platform,
        },
      },
    },
    result: {
      data: {
        createReview: {
          __typename: "Review",
          id: "r1",
          slug: "alice/hades",
          rating: 8,
          content: "Played it.",
          yearPlayed: new Date().getFullYear(),
          hoursPlayed: 12,
          platform,
          createdAt: "2026-01-01T00:00:00.000Z",
          user: {
            __typename: "User",
            id: "u1",
            username: "alice",
            slug: "alice",
            avatarColor: null,
          },
          comments: [],
        },
      },
    },
  };
}

async function renderForm(mocks: readonly MockedResponse[] = [meMock]) {
  const onSuccess = vi.fn();
  render(
    <MockedProvider mocks={mocks}>
      <AuthProvider>
        <AddReviewForm gameId="g1" onSuccess={onSuccess} />
      </AuthProvider>
    </MockedProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText("Platform")).toBeTruthy());
  return onSuccess;
}

function fillBody() {
  fireEvent.change(screen.getByPlaceholderText(/Share your thoughts/), {
    target: { value: "Played it." },
  });
  fireEvent.change(screen.getByLabelText("Hours played"), {
    target: { value: "12" },
  });
}

describe("choosing the platform a review was played on", () => {
  it("offers the fixed list, the same for every game", async () => {
    await renderForm();
    const select = screen.getByLabelText("Platform") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["", ...PLATFORMS]);
  });

  /** The first option is a real choice: not every review records one. */
  it("starts on no platform", async () => {
    await renderForm();
    const select = screen.getByLabelText("Platform") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options[0]?.textContent).toBe("Not recorded");
  });

  it("sends the selected platform", async () => {
    const onSuccess = await renderForm([meMock, createMock("Switch")]);
    fillBody();
    fireEvent.change(screen.getByLabelText("Platform"), {
      target: { value: "Switch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Review" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  /**
   * Null, not "": the server takes an explicit null as "none recorded" and
   * would refuse an empty string as a platform it does not offer.
   */
  it("sends null when none was chosen", async () => {
    const onSuccess = await renderForm([meMock, createMock(null)]);
    fillBody();
    fireEvent.click(screen.getByRole("button", { name: "Submit Review" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
