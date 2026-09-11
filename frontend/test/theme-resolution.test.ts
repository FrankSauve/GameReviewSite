// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  PALETTE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyAppearance,
  readStoredAppearance,
  resolveAppearance,
  storeAppearance,
} from "../src/lib/theme";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-palette");
});

describe("which look a visitor gets", () => {
  it("falls back to the default when nothing has been picked", () => {
    expect(resolveAppearance(null, {})).toEqual({
      theme: DEFAULT_THEME,
      palette: DEFAULT_PALETTE,
    });
  });

  it("uses what this browser remembers for a signed-out visitor", () => {
    expect(
      resolveAppearance(null, { theme: "swiss", palette: "paper" }),
    ).toEqual({ theme: "swiss", palette: "paper" });
  });

  /** The account wins, so a choice follows someone between devices. */
  it("prefers the account's choice over the browser's", () => {
    const got = resolveAppearance(
      { theme: "editorial", palette: "ember" },
      { theme: "swiss", palette: "paper" },
    );
    expect(got).toEqual({ theme: "editorial", palette: "ember" });
  });

  /** The axes are independent: an account may have set only one of them. */
  it("falls back per axis rather than all or nothing", () => {
    const got = resolveAppearance(
      { theme: "brutalist", palette: null },
      { theme: "swiss", palette: "paper" },
    );
    expect(got).toEqual({ theme: "brutalist", palette: "paper" });
  });

  /** A retired key must not be stamped: no block would match it. */
  it("ignores a value that is no longer offered", () => {
    const got = resolveAppearance(
      { theme: "vaporwave", palette: "chartreuse" },
      { theme: "swiss", palette: null },
    );
    expect(got).toEqual({ theme: "swiss", palette: DEFAULT_PALETTE });
  });
});

describe("remembering the look in this browser", () => {
  it("reads back what it stored", () => {
    storeAppearance({ theme: "swiss", palette: "paper" });
    expect(readStoredAppearance()).toEqual({
      theme: "swiss",
      palette: "paper",
    });
  });

  /** Setting one axis must not clear the other. */
  it("leaves the other axis alone", () => {
    storeAppearance({ theme: "swiss", palette: "paper" });
    storeAppearance({ theme: "brutalist" });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("brutalist");
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe("paper");
  });

  it("reports nothing stored rather than throwing when storage is refused", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    try {
      expect(readStoredAppearance()).toEqual({ theme: null, palette: null });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("stamping the look onto the page", () => {
  it("writes the two attributes the stylesheet keys off", () => {
    applyAppearance({ theme: "editorial", palette: "paper" });
    const root = document.documentElement;
    expect(root.getAttribute("data-theme")).toBe("editorial");
    expect(root.getAttribute("data-palette")).toBe("paper");
  });
});
