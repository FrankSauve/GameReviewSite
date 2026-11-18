import { describe, expect, it, vi } from "vitest";
import { renderAwardsImage } from "../src/lib/awardsImageRender.js";
import { imagePalette } from "../src/lib/shareImagePalettes.js";

/** No covers, so nothing here reaches a CDN and the time is all drawing. */
function fullYear(tag: string) {
  const game = (title: string) => ({ title, coverUrl: null });
  return {
    username: "alice",
    slug: "alice",
    year: 2026,
    site: tag,
    ranking: Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      game: game(`Game ${i}`),
    })),
    categories: Array.from({ length: 20 }, (_, i) => ({
      name: `Award ${i}`,
      game: game(`Award game ${i}`),
    })),
  };
}

describe("drawing an awards image", () => {
  it("leaves the event loop free for other requests", async () => {
    // Warm: the first draw also starts the worker and loads its fonts.
    await renderAwardsImage(
      "portrait",
      fullYear("warm"),
      imagePalette(null),
      "warm",
    );

    let last = performance.now();
    let longest = 0;
    const tick = setInterval(() => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
    }, 1);
    await Promise.all(
      ["a", "b", "c"].map((tag) =>
        renderAwardsImage("portrait", fullYear(tag), imagePalette(null), tag),
      ),
    );
    clearInterval(tick);

    // On the main thread, each layout would block it for the whole draw.
    expect(longest).toBeLessThan(50);
  });

  it("draws the next image after one fails", async () => {
    // Passes the content-type check, but is not a PNG: the draw throws.
    const corrupt = vi.fn<typeof fetch>(
      async () =>
        new Response("not a png", { headers: { "content-type": "image/png" } }),
    );
    const broken = {
      ...fullYear("broken"),
      ranking: [
        {
          rank: 1,
          game: {
            title: "Broken",
            coverUrl:
              "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1/header.jpg",
          },
        },
      ],
    };

    await expect(
      renderAwardsImage("wide", broken, imagePalette(null), "bad", corrupt),
    ).rejects.toThrow();

    const good = await renderAwardsImage(
      "wide",
      fullYear("after"),
      imagePalette(null),
      "after",
    );
    expect(good.png.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});
