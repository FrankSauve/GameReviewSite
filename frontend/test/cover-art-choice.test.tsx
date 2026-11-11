// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameCover } from "../src/components/GameCover";

afterEach(cleanup);

const COVER = "https://x.test/header.jpg";
const POSTER = "https://x.test/poster.jpg";
const BANNER = "https://x.test/hero.jpg";

describe("the art a cover slot uses", () => {
  it("is the poster in a portrait slot, and the cover where there is none", () => {
    const { rerender } = render(
      <GameCover
        game={{ title: "A", coverUrl: COVER, posterUrl: POSTER }}
        art="poster"
      />,
    );
    expect(screen.getByRole("img").getAttribute("src")).toBe(POSTER);
    rerender(<GameCover game={{ title: "A", coverUrl: COVER }} art="poster" />);
    expect(screen.getByRole("img").getAttribute("src")).toBe(COVER);
  });

  it("falls back from a poster that fails to the cover", () => {
    render(
      <GameCover
        game={{ title: "A", coverUrl: COVER, posterUrl: POSTER }}
        art="poster"
      />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img").getAttribute("src")).toBe(COVER);
  });

  it("is the cover in a wide slot, whatever else the game has", () => {
    render(
      <GameCover
        game={{
          title: "A",
          coverUrl: COVER,
          posterUrl: POSTER,
          bannerUrl: BANNER,
        }}
      />,
    );
    expect(screen.getByRole("img").getAttribute("src")).toBe(COVER);
  });

  it("crops banner art to fill whatever its shape", () => {
    render(<GameCover game={{ title: "A", bannerUrl: BANNER }} art="banner" />);
    const img = screen.getByRole("img");
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
