import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { publicQuery, resetDatabase, startApp } from "./helpers.js";
import { bannerUrl } from "../src/lib/gameSources/index.js";

const APPS =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

describe("the wide banner art for a cover", () => {
  it("is Steam's library hero for a Steam header", () => {
    expect(bannerUrl(`${APPS}/2183900/header.jpg?t=1790874369`)).toBe(
      `${APPS}/2183900/library_hero.jpg`,
    );
  });

  it("drops the hash Steam puts in some asset paths", () => {
    expect(bannerUrl(`${APPS}/2825880/895480a8fb88/header.jpg`)).toBe(
      `${APPS}/2825880/library_hero.jpg`,
    );
  });

  it("is on a host that serves it, whichever one the header came from", () => {
    expect(
      bannerUrl("https://cdn.akamai.steamstatic.com/steam/apps/570/header.jpg"),
    ).toBe(`${APPS}/570/library_hero.jpg`);
  });

  it("is none for a cover from anywhere else", () => {
    expect(
      bannerUrl(
        "https://cdn.thegamesdb.net/images/large/boxart/front/70-1.jpg",
      ),
    ).toBeNull();
    expect(
      bannerUrl(
        "https://steamstatic.com.example.com/store_item_assets/steam/apps/1/header.jpg",
      ),
    ).toBeNull();
    expect(
      bannerUrl("http://shared.akamai.steamstatic.com/steam/apps/1/h.jpg"),
    ).toBeNull();
    expect(bannerUrl(null)).toBeNull();
  });
});

describe("a game's banner art in the API", () => {
  let app: Express;
  let stop: () => Promise<void>;
  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("comes with a game whose cover is a Steam header, and not otherwise", async () => {
    const steam = await prisma.game.create({
      data: { title: "S", slug: "s", coverUrl: `${APPS}/2183900/header.jpg` },
    });
    const tgdb = await prisma.game.create({
      data: {
        title: "T",
        slug: "t",
        coverUrl:
          "https://cdn.thegamesdb.net/images/large/boxart/front/70-1.jpg",
      },
    });
    const query = `query G($id: ID!) { game(id: $id) { bannerUrl } }`;
    const banner = async (id: string) =>
      (
        await publicQuery<{ game: { bannerUrl: string | null } }>(
          app,
          query,
          {},
          { id },
        )
      ).data?.game.bannerUrl;
    expect(await banner(steam.id)).toBe(`${APPS}/2183900/library_hero.jpg`);
    expect(await banner(tgdb.id)).toBeNull();
  });
});
