import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { provisionUser } from "../src/lib/identity.js";
import { parseFavoritesImageFile } from "../src/lib/favoritesImage.js";
import { FAVORITE_CATEGORIES } from "../src/lib/favoriteCategories.js";
import { ALICE, resetDatabase, seedFavorites, startApp } from "./helpers.js";

/** A fixed Host: the site is printed on the image, so it is part of the ETag. */
let get: (path: string) => request.Test;

/** Width and height from the IHDR chunk, which always comes first. */
function pngSize(body: Buffer): { width: number; height: number } {
  expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

describe("a profile's favourites as an image", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let user: { id: string; slug: string };
  let path: string;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
    get = (p) => request(app).get(p).set("Host", "reviews.example.com");
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await resetDatabase();
    user = await provisionUser(ALICE);
    path = `/images/favorites/${user.slug}/favorites.png`;
  });

  it("draws the download at 1080×1350 for any user agent", async () => {
    await seedFavorites(user.id, [
      { category: "favorite-game", title: "Elden Ring" },
      { category: "best-story", title: "Disco Elysium" },
    ]);

    const res = await get(path);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(res.headers["content-disposition"]).toBe(
      `inline; filename="${user.slug}-favourites.png"`,
    );
    expect(pngSize(res.body as Buffer)).toEqual({ width: 1080, height: 1350 });
  });

  it("draws the preview at 1200×630", async () => {
    await seedFavorites(user.id, [
      { category: "favorite-game", title: "Elden Ring" },
    ]);

    const res = await get(`/images/favorites/${user.slug}/favorites-wide.png`);

    expect(res.status).toBe(200);
    expect(pngSize(res.body as Buffer)).toEqual({ width: 1200, height: 630 });
  });

  it("draws a full grid of twenty", async () => {
    await seedFavorites(
      user.id,
      FAVORITE_CATEGORIES.map((category, i) => ({
        category,
        title: `Game ${i}`,
      })),
    );

    const res = await get(path);

    expect(res.status).toBe(200);
    expect(pngSize(res.body as Buffer)).toEqual({ width: 1080, height: 1350 });
  });

  it("has no image for an empty grid", async () => {
    const res = await get(path);

    expect(res.status).toBe(404);
  });

  it("has no image when every pick is in a retired category", async () => {
    await seedFavorites(user.id, [
      { category: "favorite-racing-game", title: "Wipeout" },
    ]);

    const res = await get(path);

    expect(res.status).toBe(404);
  });

  it("is not redrawn for a pick in a retired category", async () => {
    await seedFavorites(user.id, [
      { category: "favorite-game", title: "Elden Ring" },
    ]);
    const before = await get(path);

    await seedFavorites(user.id, [
      { category: "favorite-racing-game", title: "Wipeout" },
    ]);
    const after = await get(path);

    expect(after.headers["etag"]).toBe(before.headers["etag"]);
  });

  it("has no image for an account that does not exist", async () => {
    const res = await get("/images/favorites/nobody/favorites.png");

    expect(res.status).toBe(404);
  });

  it("answers a repeat request with 304 until a pick changes", async () => {
    await seedFavorites(user.id, [
      { category: "favorite-game", title: "Elden Ring" },
    ]);

    const first = await get(path);
    const etag = first.headers["etag"];
    expect(etag).toBeTruthy();
    expect(first.headers["cache-control"]).toBe("public, no-cache");

    const again = await get(path).set("If-None-Match", etag ?? "");
    expect(again.status).toBe(304);

    await seedFavorites(user.id, [
      { category: "best-story", title: "Disco Elysium" },
    ]);
    const changed = await get(path).set("If-None-Match", etag ?? "");
    expect(changed.status).toBe(200);
    expect(changed.headers["etag"]).not.toBe(etag);
  });

  it("is redrawn when the owner changes palette", async () => {
    await seedFavorites(user.id, [
      { category: "favorite-game", title: "Elden Ring" },
    ]);
    const before = await get(path);

    await prisma.user.update({
      where: { id: user.id },
      data: { palette: "paper" },
    });
    const after = await get(path);

    expect(after.headers["etag"]).not.toBe(before.headers["etag"]);
  });

  it.each(["favorites", "favorites.jpg", "favourites.png", "2026.png"])(
    "has nothing at %s",
    async (file) => {
      await seedFavorites(user.id, [
        { category: "favorite-game", title: "Elden Ring" },
      ]);

      const res = await get(`/images/favorites/${user.slug}/${file}`);

      expect(res.status).toBe(404);
    },
  );
});

describe("parseFavoritesImageFile", () => {
  it.each([
    ["favorites.png", "portrait"],
    ["favorites-wide.png", "wide"],
  ])("reads %s", (file, expected) => {
    expect(parseFavoritesImageFile(file)).toBe(expected);
  });

  it.each(["favorites", "favourites.png", "favorites-tall.png", "x.png"])(
    "refuses %s",
    (file) => {
      expect(parseFavoritesImageFile(file)).toBeNull();
    },
  );
});
