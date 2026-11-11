// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameCover } from "../src/components/GameCover";
import { cropsWell } from "../src/lib/coverFit";
import { steamBannerUrl } from "../src/lib/steamBanner";

afterEach(cleanup);

const STEAM_HEADER = { width: 460, height: 215 };
const BOX_ART = { width: 1080, height: 1620 };

function loadInto(
  img: HTMLElement,
  art: { width: number; height: number },
  slot: { width: number; height: number },
) {
  for (const [key, value] of Object.entries({
    naturalWidth: art.width,
    naturalHeight: art.height,
    clientWidth: slot.width,
    clientHeight: slot.height,
  }))
    Object.defineProperty(img, key, { value });
  fireEvent.load(img);
}

describe("when art is cropped to fill its slot", () => {
  it("crops art close to the slot's shape", () => {
    expect(cropsWell(STEAM_HEADER, { width: 300, height: 176 })).toBe(true);
    expect(
      cropsWell({ width: 1920, height: 620 }, { width: 960, height: 288 }),
    ).toBe(true);
  });

  it("keeps a wide header whole in a narrow thumbnail", () => {
    expect(cropsWell(STEAM_HEADER, { width: 144, height: 180 })).toBe(false);
  });

  it("keeps box art whole in a wide banner", () => {
    expect(cropsWell(BOX_ART, { width: 960, height: 288 })).toBe(false);
  });

  it("crops what it could not measure, as before", () => {
    expect(
      cropsWell({ width: 0, height: 0 }, { width: 960, height: 288 }),
    ).toBe(true);
    expect(cropsWell(BOX_ART, { width: 0, height: 0 })).toBe(true);
  });
});

describe("a cover in a slot of a different shape", () => {
  const GAME = { title: "Hitman 3", coverUrl: "https://x.test/box.jpg" };

  it("stays cropped when the shapes are close", () => {
    render(<GameCover game={GAME} />);
    loadInto(screen.getByRole("img"), STEAM_HEADER, {
      width: 300,
      height: 176,
    });
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.className).toContain("object-cover");
  });

  it("shows the art whole over a blurred copy when they are not", () => {
    const { container } = render(<GameCover game={GAME} />);
    loadInto(screen.getByRole("img"), BOX_ART, { width: 960, height: 288 });
    expect(screen.getByAltText("Hitman 3").className).toContain(
      "object-contain",
    );
    const backdrop = container.querySelector('img[aria-hidden="true"]');
    expect(backdrop?.getAttribute("src")).toBe(GAME.coverUrl);
    expect(backdrop?.className).toContain("blur-xl");
  });

  it("measures a different game's art afresh", () => {
    const { rerender } = render(<GameCover game={GAME} />);
    loadInto(screen.getByRole("img"), BOX_ART, { width: 960, height: 288 });
    rerender(
      <GameCover game={{ title: "Hades", coverUrl: "https://x.test/h.jpg" }} />,
    );
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.className).toContain("object-cover");
  });
});

describe("the art a wide banner uses", () => {
  const HEADER =
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2183900/header.jpg?t=1790874369";
  const HERO =
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2183900/library_hero.jpg";

  it("finds Steam's banner art from its header, hashed path or not", () => {
    expect(steamBannerUrl(HEADER)).toBe(HERO);
    expect(
      steamBannerUrl(
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2825880/895480a8fb88/header.jpg",
      ),
    ).toBe(
      "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2825880/library_hero.jpg",
    );
  });

  it("has none for a cover from anywhere else", () => {
    expect(
      steamBannerUrl(
        "https://cdn.thegamesdb.net/images/large/boxart/front/70-1.jpg",
      ),
    ).toBeNull();
    expect(
      steamBannerUrl(
        "https://steamstatic.com.example.com/store_item_assets/steam/apps/1/header.jpg",
      ),
    ).toBeNull();
    expect(steamBannerUrl("not a url")).toBeNull();
  });

  it("uses it in a banner, and falls back to the cover when it is missing", () => {
    render(
      <GameCover game={{ title: "Space Marine 2", coverUrl: HEADER }} banner />,
    );
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toBe(HERO);
    fireEvent.error(img);
    expect(screen.getByRole("img").getAttribute("src")).toBe(HEADER);
  });

  it("is not used outside a banner", () => {
    render(<GameCover game={{ title: "Space Marine 2", coverUrl: HEADER }} />);
    expect(screen.getByRole("img").getAttribute("src")).toBe(HEADER);
  });
});
