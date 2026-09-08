// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import { ReactionBar } from "../src/components/ReactionBar";
import type { ReactionSummary } from "../src/types";
import { AuthProvider } from "../src/contexts/AuthContext";
import { GET_ME, TOGGLE_REACTION } from "../src/graphql/mutations";
import { DEFAULT_REACTIONS, searchEmoji } from "../src/lib/emoji";
import { describeReactors } from "../src/lib/reactors";
import { GET_REACTION_USERS } from "../src/graphql/queries";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(cleanup);

/**
 * The bar renders before AuthProvider's `me` query settles, and a click while it
 * is still loading goes to sign-in rather than to the mutation.
 */
async function whenSignedIn(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

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

const anonMock = {
  request: { query: GET_ME },
  result: { data: { me: null } },
};

function toggleMock(emoji: string, result: ReactionSummary[]) {
  return {
    request: {
      query: TOGGLE_REACTION,
      variables: { input: { reviewId: "r1", emoji } },
    },
    result: {
      data: {
        toggleReaction: result.map((r) => ({
          __typename: "ReactionSummary",
          ...r,
        })),
      },
    },
  };
}

function reactorsMock(emoji: string, usernames: string[]) {
  return {
    request: {
      query: GET_REACTION_USERS,
      variables: { reviewId: "r1", emoji },
    },
    result: { data: { reactionUsers: usernames } },
  };
}

function renderBar(
  reactions: ReactionSummary[] | null,
  mocks: readonly MockedResponse[] = [meMock],
) {
  return render(
    <MockedProvider mocks={mocks}>
      <AuthProvider>
        <ReactionBar reviewId="r1" reactions={reactions} />
      </AuthProvider>
    </MockedProvider>,
  );
}

describe("the reaction bar", () => {
  it("shows no emoji at all until somebody reacts", () => {
    const { container } = renderBar([]);
    expect(screen.getByRole("button", { name: "Add a reaction" })).toBeTruthy();
    for (const emoji of DEFAULT_REACTIONS) {
      expect(
        screen.queryByRole("button", { name: `React with ${emoji}` }),
      ).toBeNull();
    }
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("renders the count beside an emoji people have used", () => {
    renderBar([{ emoji: "👍", count: 3, reacted: false }]);
    const chip = screen.getByRole("button", { name: "React with 👍" });
    expect(chip.textContent).toBe("👍3");
  });

  it("marks the viewer's own reaction, and only that one", () => {
    renderBar([
      { emoji: "👍", count: 3, reacted: true },
      { emoji: "😂", count: 1, reacted: false },
    ]);
    expect(
      screen
        .getByRole("button", { name: "React with 👍" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "React with 😂" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("shows an emoji outside the default row when someone has used it", () => {
    renderBar([{ emoji: "🎉", count: 2, reacted: false }]);
    expect(
      screen.getByRole("button", { name: "React with 🎉" }).textContent,
    ).toBe("🎉2");
  });

  it("takes the new counts from the mutation, without a refetch", async () => {
    renderBar(
      [{ emoji: "👍", count: 3, reacted: false }],
      [meMock, toggleMock("👍", [{ emoji: "👍", count: 4, reacted: true }])],
    );
    await whenSignedIn();
    fireEvent.click(screen.getByRole("button", { name: "React with 👍" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "React with 👍" }).textContent,
      ).toBe("👍4"),
    );
    expect(
      screen
        .getByRole("button", { name: "React with 👍" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("sends no mutation for a signed-out visitor", async () => {
    // A mutation mock would have to be matched; none is supplied, so an attempt
    // to send one fails the render instead of passing quietly.
    renderBar([{ emoji: "👍", count: 3, reacted: false }], [anonMock]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "React with 👍" }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "React with 👍" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "React with 👍" }).textContent,
      ).toBe("👍3"),
    );
  });
});

describe("the quick reaction menu", () => {
  it("opens the defaults on the add button and closes on Escape", async () => {
    renderBar([]);
    fireEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    for (const emoji of DEFAULT_REACTIONS) {
      expect(
        screen.getByRole("button", { name: `React with ${emoji}` }),
      ).toBeTruthy();
    }
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "React with 👍" }),
      ).toBeNull(),
    );
  });

  it("reacts with a default and closes the menu", async () => {
    renderBar(
      [],
      [meMock, toggleMock("👍", [{ emoji: "👍", count: 1, reacted: true }])],
    );
    await whenSignedIn();
    fireEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    fireEvent.click(screen.getByRole("button", { name: "React with 👍" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "React with 👍" }).textContent,
      ).toBe("👍1"),
    );
    expect(screen.queryByRole("button", { name: "More emoji" })).toBeNull();
  });
});

describe("naming who reacted", () => {
  const chip = () => screen.getByRole("button", { name: "React with 👍" });
  const two: ReactionSummary[] = [{ emoji: "👍", count: 2, reacted: false }];

  it("names them on hover and hides them again on leave", async () => {
    renderBar(two, [meMock, reactorsMock("👍", ["alice", "bob"])]);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(chip());
    // The card opens on the count it already has and fills in the names.
    expect(screen.getByRole("tooltip").textContent).toBe(
      "2 people reacted with 👍",
    );
    await waitFor(() =>
      expect(screen.getByRole("tooltip").textContent).toBe(
        "alice and bob reacted with 👍",
      ),
    );

    fireEvent.mouseLeave(chip());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("asks for nobody's names until a chip is hovered", async () => {
    let asked = 0;
    // Matches whatever it is asked, so an eager fetch counts too.
    const counted: MockedResponse = {
      request: { query: GET_REACTION_USERS },
      variableMatcher: () => true,
      result: () => {
        asked += 1;
        return { data: { reactionUsers: ["alice", "bob"] } };
      },
    };
    renderBar(two, [meMock, counted]);
    await whenSignedIn();
    expect(asked).toBe(0);

    fireEvent.mouseEnter(chip());
    await waitFor(() => expect(asked).toBe(1));
  });

  it("names them on keyboard focus too", async () => {
    renderBar(two, [meMock, reactorsMock("👍", ["alice", "bob"])]);
    fireEvent.focus(chip());
    const tooltip = screen.getByRole("tooltip");
    expect(chip().getAttribute("aria-describedby")).toBe(tooltip.id);
    await waitFor(() =>
      expect(screen.getByRole("tooltip").textContent).toBe(
        "alice and bob reacted with 👍",
      ),
    );
  });

  it("names them on a long press, without toggling the reaction", async () => {
    vi.useFakeTimers();
    try {
      renderBar(two, [meMock, reactorsMock("👍", ["alice", "bob"])]);
      fireEvent.touchStart(chip());
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole("tooltip")).toBeTruthy();
      fireEvent.touchEnd(chip());
      // The browser fires this after the hold; there is no toggle mocked for
      // it, so a mutation here would fail the test.
      fireEvent.click(chip());
      expect(chip().textContent).toBe("👍2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still toggles on a tap that is not held", async () => {
    renderBar(two, [
      meMock,
      toggleMock("👍", [{ emoji: "👍", count: 3, reacted: true }]),
    ]);
    await whenSignedIn();
    fireEvent.touchStart(chip());
    fireEvent.touchEnd(chip());
    fireEvent.click(chip());
    await waitFor(() => expect(chip().textContent).toBe("👍3"));
  });
});

describe("the reactor list", () => {
  it("joins two names with and, and more with commas", () => {
    expect(describeReactors(["alice"], 1)).toBe("alice");
    expect(describeReactors(["alice", "bob"], 2)).toBe("alice and bob");
    expect(describeReactors(["alice", "bob", "cara"], 3)).toBe(
      "alice, bob and cara",
    );
  });

  it("counts the ones the query did not name", () => {
    expect(describeReactors(["alice", "bob"], 3)).toBe(
      "alice, bob and 1 other",
    );
    expect(describeReactors(["alice", "bob"], 7)).toBe(
      "alice, bob and 5 others",
    );
  });

  it("falls back to a bare count while the names are in flight", () => {
    expect(describeReactors([], 1)).toBe("1 person");
    expect(describeReactors([], 4)).toBe("4 people");
  });
});

describe("the emoji picker", () => {
  /** Two clicks now: the defaults first, then the plus that widens them. */
  function openPicker() {
    fireEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    fireEvent.click(screen.getByRole("button", { name: "More emoji" }));
  }

  it("opens behind the quick menu's plus and closes on Escape", async () => {
    renderBar([]);
    fireEvent.click(screen.getByRole("button", { name: "Add a reaction" }));
    expect(screen.queryByLabelText("Search emoji")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More emoji" }));
    expect(screen.getByLabelText("Search emoji")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByLabelText("Search emoji")).toBeNull(),
    );
  });

  it("filters to the emoji whose names match the search", () => {
    renderBar([]);
    openPicker();
    fireEvent.change(screen.getByLabelText("Search emoji"), {
      target: { value: "birthday" },
    });
    expect(screen.getByRole("button", { name: "birthday cake" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "grinning face" })).toBeNull();
  });

  it("reacts with the emoji picked and closes", async () => {
    renderBar(
      [],
      [meMock, toggleMock("🎉", [{ emoji: "🎉", count: 1, reacted: true }])],
    );
    await whenSignedIn();
    openPicker();
    fireEvent.change(screen.getByLabelText("Search emoji"), {
      target: { value: "party popper" },
    });
    fireEvent.click(screen.getByRole("button", { name: "party popper" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "React with 🎉" }).textContent,
      ).toBe("🎉1"),
    );
    expect(screen.queryByLabelText("Search emoji")).toBeNull();
  });
});

describe("searching the bundled emoji data", () => {
  it("returns everything for an empty query", () => {
    expect(searchEmoji("").length).toBeGreaterThan(1500);
  });

  it("matches every word of the query against the name", () => {
    expect(searchEmoji("grinning face").map((e) => e.char)).toContain("😀");
    expect(searchEmoji("face grinning").map((e) => e.char)).toContain("😀");
    expect(searchEmoji("grinning banana")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(searchEmoji("THUMBS UP").map((e) => e.char)).toContain("👍");
  });

  it("carries the default reactions, fully qualified", () => {
    const chars = new Set(searchEmoji("").map((e) => e.char));
    for (const emoji of DEFAULT_REACTIONS) expect(chars.has(emoji)).toBe(true);
  });
});
