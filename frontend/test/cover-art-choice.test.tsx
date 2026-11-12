// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameArtBand } from "../src/components/GameArtBand";
import { GameCover } from "../src/components/GameCover";

afterEach(cleanup);

const COVER = "https://x.test/header.jpg";
const POSTER = "https://x.test/poster.jpg";
const BANNER = "https://x.test/hero.jpg";

const srcs = (container: HTMLElement) =>
  [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));

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

describe("the art at the top of a game", () => {
  it("lays the title over the banner art where there is some", () => {
    const { container } = render(
      <GameArtBand
        game={{
          title: "Space Marine 2",
          coverUrl: COVER,
          posterUrl: POSTER,
          bannerUrl: BANNER,
        }}
        className="h-72"
        pad="p-6"
      >
        <h1>Space Marine 2</h1>
      </GameArtBand>,
    );
    expect(srcs(container)).toEqual([BANNER]);
    expect(
      screen.getByRole("heading", { name: "Space Marine 2" }),
    ).toBeDefined();
  });

  it("sets the poster beside the title where there is no banner art", () => {
    const { container } = render(
      <GameArtBand
        game={{
          title: "Final Fantasy VII",
          coverUrl: POSTER,
          posterUrl: POSTER,
        }}
        className="h-72"
        pad="p-6"
      >
        <h1>Final Fantasy VII</h1>
      </GameArtBand>,
    );
    // The poster, and the same art blurred behind it.
    expect(srcs(container)).toEqual([POSTER, POSTER]);
    expect(container.querySelector(".aspect-\\[2\\/3\\] img")).not.toBeNull();
  });

  it("falls back to the poster when the banner art fails to load", () => {
    const { container } = render(
      <GameArtBand
        game={{
          title: "A",
          coverUrl: COVER,
          posterUrl: POSTER,
          bannerUrl: BANNER,
        }}
        className="h-72"
        pad="p-6"
      >
        <h1>A</h1>
      </GameArtBand>,
    );
    const banner = container.querySelector("img");
    if (!banner) throw new Error("no banner drawn");
    fireEvent.error(banner);
    expect(srcs(container)).toEqual([POSTER, POSTER]);
  });

  it("lays a cover across the band for a game with no poster", () => {
    const { container } = render(
      <GameArtBand
        game={{ title: "A", coverUrl: COVER }}
        className="h-72"
        pad="p-6"
      >
        <h1>A</h1>
      </GameArtBand>,
    );
    expect(srcs(container)).toEqual([COVER]);
    expect(container.querySelector(".aspect-\\[2\\/3\\]")).toBeNull();
  });

  it("draws the title's placeholder for a game with no art", () => {
    const { container } = render(
      <GameArtBand game={{ title: "Unknown" }} className="h-40" pad="p-4">
        <h2>Unknown</h2>
      </GameArtBand>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("🎮")).toBeDefined();
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
