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
import { renderAwardsImage } from "../src/lib/awardsImageRender.js";
import { ALICE, resetDatabase, seedAwardYear, startApp } from "./helpers.js";

/** Wrapped, not replaced: the image route must still draw for real. */
vi.mock("../src/lib/awardsImageRender.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/awardsImageRender.js")>();
  return { ...actual, renderAwardsImage: vi.fn(actual.renderAwardsImage) };
});

const draws = vi.mocked(renderAwardsImage);
const HOST = "reviews.example.com";

describe("the awards preview, drawn when a link is unfurled", () => {
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
    await seedAwardYear(user.id, 2026, { ranked: ["Hollow Knight"] });

    const page = await request(app)
      .get(`/users/${user.slug}/awards/2026`)
      .set("Host", HOST);

    expect(draws).toHaveBeenCalledTimes(1);
    const [kind, , , version] = draws.mock.calls[0] ?? [];
    expect(kind).toBe("wide");
    expect(page.text).toContain(`2026-wide.png?v=${version}`);

    // The crawler's fetch is served from that render.
    const image = await request(app)
      .get(`/images/awards/${user.slug}/2026-wide.png`)
      .set("Host", HOST);
    expect(image.status).toBe(200);
    expect(draws).toHaveBeenCalledTimes(2);
    expect(draws.mock.results[1]?.value).toBe(draws.mock.results[0]?.value);
  });

  it("draws nothing for a year with nothing in it", async () => {
    await seedAwardYear(user.id, 2025, { ranked: ["Hollow Knight"] });

    await request(app).get(`/users/${user.slug}/awards/2026`).set("Host", HOST);

    expect(draws).not.toHaveBeenCalled();
  });

  it("draws nothing for the other tabs", async () => {
    await seedAwardYear(user.id, 2026, { ranked: ["Hollow Knight"] });

    await request(app).get(`/users/${user.slug}`).set("Host", HOST);
    await request(app).get(`/users/${user.slug}/favorites`).set("Host", HOST);

    expect(draws).not.toHaveBeenCalled();
  });

  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Applebot/0.1",
  ])("draws nothing for a search engine: %s", async (agent) => {
    await seedAwardYear(user.id, 2026, { ranked: ["Hollow Knight"] });

    const page = await request(app)
      .get(`/users/${user.slug}/awards/2026`)
      .set("Host", HOST)
      .set("User-Agent", agent);

    // The page still names the image; it is only not drawn ahead.
    expect(page.text).toContain("2026-wide.png?v=");
    expect(draws).not.toHaveBeenCalled();
  });

  it("draws ahead for a chat client", async () => {
    await seedAwardYear(user.id, 2026, { ranked: ["Hollow Knight"] });

    await request(app)
      .get(`/users/${user.slug}/awards/2026`)
      .set("Host", HOST)
      .set(
        "User-Agent",
        "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      );

    expect(draws).toHaveBeenCalledTimes(1);
  });

  it("never draws the download from an unfurl", async () => {
    await seedAwardYear(user.id, 2026, { ranked: ["Hollow Knight"] });

    await request(app).get(`/users/${user.slug}/awards/2026`).set("Host", HOST);

    expect(draws.mock.calls.map(([kind]) => kind)).toEqual(["wide"]);
  });
});
