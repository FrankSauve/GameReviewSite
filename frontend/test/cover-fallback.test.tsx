// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GameCover } from "../src/components/GameCover";
import { titleGradient } from "../src/lib/coverGradient";

afterEach(cleanup);

const WITH_COVER = { title: "Elden Ring", coverUrl: "https://x.test/a.jpg" };

/**
 * One component draws every cover on the site, so what it does with a missing
 * one is what every page does with a missing one.
 */
describe("a game cover", () => {
  it("renders the art when there is any", () => {
    render(<GameCover game={WITH_COVER} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "https://x.test/a.jpg",
    );
  });

  it("names the game, so a card with no caption is still readable", () => {
    render(<GameCover game={WITH_COVER} />);
    expect(screen.getByAltText("Elden Ring")).toBeDefined();
  });

  /** Decorative where the title already sits beside it: no duplicate reading. */
  it("goes silent when the caller says it is decorative", () => {
    render(<GameCover game={WITH_COVER} decorative />);
    expect(screen.getByRole("presentation")).toBeDefined();
  });

  it("defers the fetch unless the caller is above the fold", () => {
    const { rerender } = render(<GameCover game={WITH_COVER} />);
    expect(screen.getByRole("img").getAttribute("loading")).toBe("lazy");
    rerender(<GameCover game={WITH_COVER} eager />);
    expect(screen.getByRole("img").getAttribute("loading")).toBeNull();
  });

  it("falls back to the title's gradient when there is no art", () => {
    const { container } = render(<GameCover game={{ title: "Hades" }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("🎮")).toBeDefined();
    expect(container.firstElementChild?.className).toContain(
      titleGradient("Hades"),
    );
  });

  it("still draws something for a game that never arrived", () => {
    render(<GameCover game={null} />);
    expect(screen.getByText("🎮")).toBeDefined();
  });

  it("scales the placeholder to the box it is given", () => {
    const { container, rerender } = render(
      <GameCover game={{ title: "Hades" }} size="sm" />,
    );
    expect(container.querySelector("span")?.className).toContain("text-lg");
    rerender(<GameCover game={{ title: "Hades" }} size="lg" />);
    expect(container.querySelector("span")?.className).toContain("text-4xl");
  });
});

/** The same game must not change colour between the pages that draw it. */
describe("the placeholder gradient", () => {
  it("is stable for a title", () => {
    expect(titleGradient("Hades")).toBe(titleGradient("Hades"));
  });

  /**
   * The reason it is djb2 and not a sum of char codes: a sum is
   * order-independent, so it hands every anagram of a title the same colour.
   */
  it("separates titles that are anagrams of each other", () => {
    expect(titleGradient("Limbo")).not.toBe(titleGradient("Bloim"));
    expect(titleGradient("Doom")).not.toBe(titleGradient("Modo"));
  });

  it("differs across titles, so a list is not one flat colour", () => {
    const seen = new Set(
      ["Hades", "Elden Ring", "Celeste", "Doom", "Hollow Knight"].map(
        titleGradient,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("handles a game with no title at all", () => {
    expect(titleGradient("")).toMatch(/^cover-\d+$/);
  });
});
