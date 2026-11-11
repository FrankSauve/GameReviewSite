// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameCover } from "../src/components/GameCover";

afterEach(cleanup);

// GameCover remembers a missing banner for the page's life, so each test
// uses app ids no other test does.
const APPS =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

describe("the art a wide banner uses", () => {
  it("is the game's banner art, cropped to fill whatever its shape", () => {
    const hero = `${APPS}/1/library_hero.jpg`;
    render(
      <GameCover
        game={{ title: "A", coverUrl: `${APPS}/1/header.jpg`, bannerUrl: hero }}
        banner
      />,
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe(hero);
    for (const [key, value] of Object.entries({
      naturalWidth: 1920,
      naturalHeight: 620,
      clientWidth: 343,
      clientHeight: 224,
    }))
      Object.defineProperty(img, key, { value });
    fireEvent.load(img);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(img.className).toContain("object-cover");
  });

  it("falls back to the cover, and remembers the miss for the next mount", () => {
    const game = {
      title: "B",
      coverUrl: `${APPS}/2/header.jpg`,
      bannerUrl: `${APPS}/2/library_hero.jpg`,
    };
    render(<GameCover game={game} banner />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img").getAttribute("src")).toBe(game.coverUrl);
    cleanup();
    render(<GameCover game={game} banner />);
    expect(screen.getByRole("img").getAttribute("src")).toBe(game.coverUrl);
  });

  it("is not used outside a banner", () => {
    render(
      <GameCover
        game={{
          title: "C",
          coverUrl: `${APPS}/3/header.jpg`,
          bannerUrl: `${APPS}/3/library_hero.jpg`,
        }}
      />,
    );
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      `${APPS}/3/header.jpg`,
    );
  });
});

describe("a cover that fails to load", () => {
  it("gives way to the title's placeholder, not a broken image", () => {
    const { container } = render(
      <GameCover game={{ title: "D", coverUrl: "https://x.test/dead.jpg" }} />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("🎮")).toBeDefined();
  });

  it("still names the game to a screen reader", () => {
    render(
      <GameCover game={{ title: "Dead", coverUrl: "https://x.test/d2.jpg" }} />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img", { name: "Dead" })).toBeDefined();
    expect(screen.getByText("🎮").getAttribute("aria-hidden")).toBe("true");
  });

  it("stays silent where the caller says it is decorative", () => {
    render(
      <GameCover
        game={{ title: "Quiet", coverUrl: "https://x.test/d3.jpg" }}
        decorative
      />,
    );
    fireEvent.error(screen.getByRole("presentation"));
    expect(screen.queryByRole("img")).toBeNull();
  });
});
