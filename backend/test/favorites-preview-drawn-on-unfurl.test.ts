import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import type { Express } from "express";
import { provisionUser } from "../src/lib/identity.js";
import { renderFavoritesImage } from "../src/lib/favoritesImageRender.js";
import { ALICE, resetDatabase, seedFavorites, startApp } from "./helpers.js";

/** Wrapped, not replaced: the image route must still draw for real. */
vi.mock("../src/lib/favoritesImageRender.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/favoritesImageRender.js")>();
  return {
    ...actual,
    renderFavoritesImage: vi.fn(actual.renderFavoritesImage),
  };
});

const draws = vi.mocked(renderFavoritesImage);
const HOST = "reviews.example.com";

describe("the favourites preview, drawn when a link is unfurled", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let user: { id: string; slug: string };

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await resetDatabase();
    user = await provisionUser(ALICE);
    draws.mockClear();
  });

  it("starts the image the unfurl names, before the crawler asks", async () => {
    await seedFavorites(user.id, [
      { category: "favorite-game", title: "Hollow Knight" },
    ]);

    const page = await request(app)
      .get(`/users/${user.slug}/favorites`)
      .set("Host", HOST);

    expect(draws).toHaveBeenCalledTimes(1);
    const [kind, , , version] = draws.mock.calls[0] ?? [];
    expect(kind).toBe("wide");
    expect(page.text).toContain(`favorites-wide.png?v=${version}`);

    // The crawler's fetch is served from that render.
    const image = await request(app)
      .get(`/images/favorites/${user.slug}/favorites-wide.png`)
      .set("Host", HOST);
    expect(image.status).toBe(200);
    expect(draws).toHaveBeenCalledTimes(2);
    expect(draws.mock.results[1]?.value).toBe(draws.mock.results[0]?.value);
  });

  it("draws nothing for an empty grid", async () => {
    await request(app).get(`/users/${user.slug}/favorites`).set("Host", HOST);

    expect(draws).not.toHaveBeenCalled();
  });

  it("draws nothing for the other tabs", async () => {
    await seedFavorites(user.id, [
      { category: "favorite-game", title: "Hollow Knight" },
    ]);

    await request(app).get(`/users/${user.slug}`).set("Host", HOST);
    await request(app).get(`/users/${user.slug}/awards`).set("Host", HOST);

    expect(draws).not.toHaveBeenCalled();
  });

  it("draws nothing for a search engine", async () => {
    await seedFavorites(user.id, [
      { category: "favorite-game", title: "Hollow Knight" },
    ]);

    const page = await request(app)
      .get(`/users/${user.slug}/favorites`)
      .set("Host", HOST)
      .set(
        "User-Agent",
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      );

    // The page still names the image; it is only not drawn ahead.
    expect(page.text).toContain("favorites-wide.png?v=");
    expect(draws).not.toHaveBeenCalled();
  });
});
