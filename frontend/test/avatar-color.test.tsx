// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import {
  AVATAR_COLORS,
  AVATAR_COLOR_KEYS,
  avatarColor,
  avatarGradient,
} from "../src/lib/avatarColor";
import { Avatar } from "../src/components/Avatar";
import { AvatarColorPicker } from "../src/components/AvatarColorPicker";
import { UPDATE_PROFILE } from "../src/graphql/mutations";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(cleanup);

describe("avatarColor", () => {
  it("uses the account's own choice", () => {
    expect(avatarColor({ slug: "alice", avatarColor: "teal" })).toBe("teal");
  });

  /** A key retired from the palette must not leave an avatar with no gradient. */
  it("falls back when the stored key is not in the palette", () => {
    expect(avatarColor({ slug: "alice", avatarColor: "puce" })).toBe(
      avatarColor({ slug: "alice" }),
    );
  });

  it("is the same colour for one slug on every page", () => {
    expect(avatarColor({ slug: "alice" })).toBe(avatarColor({ slug: "alice" }));
  });

  /**
   * The bug in #107: a sum of char codes put most short names on the same few
   * gradients. Nothing guarantees a perfect spread, but a dozen names must not
   * collapse onto one or two.
   */
  it("spreads a handful of slugs across the palette", () => {
    const slugs = [
      "alice",
      "bob",
      "carol",
      "dave",
      "erin",
      "frank",
      "grace",
      "heidi",
      "ivan",
      "judy",
      "mallory",
      "trent",
    ];
    const used = new Set(slugs.map((slug) => avatarColor({ slug })));
    expect(used.size).toBeGreaterThanOrEqual(6);
  });

  it("gives every palette key a gradient", () => {
    for (const key of AVATAR_COLOR_KEYS)
      expect(AVATAR_COLORS[key]).toBeTruthy();
  });

  it("still resolves for a user with no slug", () => {
    expect(avatarGradient({})).toBeTruthy();
  });
});

describe("Avatar", () => {
  it("draws the account's colour, not one derived from the slug", () => {
    const { container } = render(
      <Avatar
        user={{ slug: "alice", username: "alice", avatarColor: "rose" }}
        size={9}
      />,
    );
    expect(container.firstElementChild?.className).toContain(
      AVATAR_COLORS.rose,
    );
  });

  it("stands in for a deleted author", () => {
    const { container } = render(<Avatar user={null} size={9} />);
    expect(container.textContent).toBe("?");
  });
});

describe("AvatarColorPicker", () => {
  const user = {
    id: "u1",
    slug: "alice",
    username: "alice",
    avatarColor: null,
  };

  function pickMock(color: string): MockedResponse {
    return {
      request: {
        query: UPDATE_PROFILE,
        variables: { input: { avatarColor: color } },
      },
      result: {
        data: {
          updateProfile: {
            __typename: "User",
            id: "u1",
            bio: null,
            avatarColor: color,
          },
        },
      },
    };
  }

  function renderPicker(mocks: readonly MockedResponse[] = []) {
    return render(
      <MockedProvider mocks={mocks}>
        <AvatarColorPicker user={user} />
      </MockedProvider>,
    );
  }

  it("keeps the swatches closed until the avatar is clicked", () => {
    renderPicker();
    expect(screen.queryByRole("button", { name: "teal" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /change avatar/i }));
    expect(screen.getByRole("button", { name: "teal" })).toBeTruthy();
  });

  it("saves the picked colour and closes", async () => {
    renderPicker([pickMock("teal")]);
    fireEvent.click(screen.getByRole("button", { name: /change avatar/i }));
    fireEvent.click(screen.getByRole("button", { name: "teal" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "teal" })).toBeNull(),
    );
  });

  it("marks the colour in use", () => {
    render(
      <MockedProvider mocks={[]}>
        <AvatarColorPicker user={{ ...user, avatarColor: "lime" }} />
      </MockedProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /change avatar/i }));
    expect(
      screen.getByRole("button", { name: "lime" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
