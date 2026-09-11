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
import type { ReactNode } from "react";
import { AuthProvider } from "../src/contexts/AuthContext";
import { ThemeProvider } from "../src/contexts/ThemeContext";
import { AppearancePicker } from "../src/components/AppearancePicker";
import { UPDATE_PROFILE, GET_ME } from "../src/graphql/mutations";
import { PALETTE_STORAGE_KEY, THEME_STORAGE_KEY } from "../src/lib/theme";

/** See the note in profile-views.test.tsx: vitest runs without globals here. */
afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-palette");
});

function meMock(
  me: Record<string, unknown> | null,
): MockedResponse<Record<string, unknown>> {
  return { request: { query: GET_ME }, result: { data: { me } } };
}

function renderPicker(mocks: MockedResponse[], children?: ReactNode) {
  return render(
    <MockedProvider mocks={mocks}>
      <AuthProvider>
        <ThemeProvider>
          <AppearancePicker />
          {children}
        </ThemeProvider>
      </AuthProvider>
    </MockedProvider>,
  );
}

const open = () =>
  fireEvent.click(screen.getByRole("button", { name: "Change appearance" }));

describe("picking a look", () => {
  it("stamps the choice onto the page", async () => {
    renderPicker([meMock(null)]);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Editorial" }));

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe(
        "editorial",
      ),
    );
  });

  it("remembers the choice in this browser", async () => {
    renderPicker([meMock(null)]);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));

    await waitFor(() =>
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("brutalist"),
    );
  });

  /** The two axes are independent, so one must not reset the other. */
  it("keeps the theme when the palette changes", async () => {
    renderPicker([meMock(null)]);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Quiet" }));
    fireEvent.click(screen.getByRole("button", { name: "Paper" }));

    await waitFor(() => {
      const root = document.documentElement;
      expect(root.getAttribute("data-theme")).toBe("swiss");
      expect(root.getAttribute("data-palette")).toBe("paper");
    });
  });

  it("marks the option in use", async () => {
    renderPicker([meMock(null)]);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Quiet" }));

    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Quiet" })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
  });
});

describe("a signed-in account's look", () => {
  const ALICE = {
    __typename: "User",
    id: "u1",
    slug: "alice",
    username: "alice",
    avatarColor: null,
    email: null,
  };

  /** The account's stored choice wins over whatever this browser remembers. */
  it("follows the account rather than the browser", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "swiss");
    renderPicker([meMock({ ...ALICE, theme: "brutalist", palette: "ember" })]);

    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe(
        "brutalist",
      ),
    );
  });

  /**
   * A visitor who picked a look before signing in keeps it: the local choice is
   * pushed up rather than the empty account overwriting it.
   */
  it("adopts the browser's choice when the account has none", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "editorial");
    let pushed: unknown = null;
    const adopt: MockedResponse = {
      request: {
        query: UPDATE_PROFILE,
        variables: { input: { theme: "editorial", palette: "midnight" } },
      },
      result: () => {
        pushed = { theme: "editorial" };
        return {
          data: {
            updateProfile: {
              __typename: "User",
              id: "u1",
              bio: null,
              avatarColor: null,
              theme: "editorial",
              palette: "midnight",
            },
          },
        };
      },
    };

    renderPicker([meMock({ ...ALICE, theme: null, palette: null }), adopt]);

    await waitFor(() => expect(pushed).not.toBeNull());
  });

  /**
   * Without this the pre-paint script has nothing to read, so every load on a
   * device that never used the picker paints the default until `me` answers.
   */
  it("is remembered by a browser that never picked it", async () => {
    renderPicker([meMock({ ...ALICE, theme: "brutalist", palette: "paper" })]);

    await waitFor(() =>
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("brutalist"),
    );
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe("paper");
  });
});
