import { describe, expect, it, vi } from "vitest";
import { inlineCover } from "../src/lib/shareImageRender.js";
import { renderAwardsImage } from "../src/lib/awardsImageRender.js";
import { imagePalette } from "../src/lib/shareImagePalettes.js";

/** The server fetches these itself, so the host allowlist is checked again. */

const STEAM =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1/header.jpg";

const FINAL_PLACEHOLDER = { cover: null, transient: false };

function answering(body: string, type: string | null, status = 200) {
  return vi.fn<typeof fetch>(async () => {
    const headers = new Headers();
    if (type) headers.set("content-type", type);
    return new Response(body, { status, headers });
  });
}

describe("fetching a cover for a shared image", () => {
  it("inlines an image from a game source's CDN", async () => {
    const fetchImpl = answering("jpegbytes", "image/jpeg");

    const cover = await inlineCover(STEAM, fetchImpl);

    expect(cover).toEqual({
      cover: `data:image/jpeg;base64,${Buffer.from("jpegbytes").toString("base64")}`,
      transient: false,
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it.each([
    ["another host", "https://example.com/header.jpg"],
    ["plain http", STEAM.replace("https:", "http:")],
    ["a lookalike host", "https://steamstatic.com.evil.test/header.jpg"],
    ["a private address", "https://127.0.0.1/header.jpg"],
  ])("never requests %s", async (_, url) => {
    const fetchImpl = answering("x", "image/jpeg");

    expect(await inlineCover(url, fetchImpl)).toEqual(FINAL_PLACEHOLDER);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("draws the placeholder for no cover at all", async () => {
    const fetchImpl = answering("x", "image/jpeg");
    expect(await inlineCover(null, fetchImpl)).toEqual(FINAL_PLACEHOLDER);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["a cover that is gone", answering("x", "image/jpeg", 404)],
    ["something that is not an image", answering("<svg/>", "image/svg+xml")],
    ["no content type", answering("x", null)],
    ["a WebP, which resvg cannot draw", answering("x", "image/webp")],
    ["a redirect", answering("", null, 302)],
    [
      "a body past the cap with no content-length",
      answering("x".repeat(2 * 1024 * 1024 + 1), "image/jpeg"),
    ],
  ])("draws the placeholder for good for %s", async (_, fetchImpl) => {
    expect(await inlineCover(STEAM, fetchImpl)).toEqual(FINAL_PLACEHOLDER);
  });

  it.each([
    ["the CDN is unreachable", () => Promise.reject(new TypeError("down"))],
    ["the CDN is failing", answering("x", "text/plain", 503)],
    ["the CDN is rate-limiting", answering("x", "text/plain", 403)],
  ])("draws the placeholder for now when %s", async (_, impl) => {
    const fetchImpl = vi.fn<typeof fetch>(impl);
    expect(await inlineCover(STEAM, fetchImpl)).toEqual({
      cover: null,
      transient: true,
    });
  });
});

describe("an awards image drawn while a cover is unreachable", () => {
  it("is marked incomplete and drawn again next time", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const source = {
      username: "alice",
      slug: "alice",
      year: 2026,
      site: "reviews.example.com",
      ranking: [{ rank: 1, game: { title: "Celeste", coverUrl: STEAM } }],
      categories: [],
    };
    const draw = () =>
      renderAwardsImage("wide", source, imagePalette(null), "v", fetchImpl);

    expect((await draw()).complete).toBe(false);
    await draw();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("an awards image whose cover is gone for good", () => {
  it("is complete, so it is kept", async () => {
    const fetchImpl = answering("x", "text/html", 404);
    const source = {
      username: "alice",
      slug: "alice",
      year: 2026,
      site: "reviews.example.com",
      ranking: [{ rank: 1, game: { title: "Celeste", coverUrl: STEAM } }],
      categories: [],
    };
    const draw = () =>
      renderAwardsImage("wide", source, imagePalette(null), "gone", fetchImpl);

    expect((await draw()).complete).toBe(true);
    await draw();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
