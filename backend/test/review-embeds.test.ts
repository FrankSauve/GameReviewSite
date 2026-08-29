import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import { embedDescription, escapeHtml } from "../src/lib/embed.js";
import { provisionUser } from "../src/lib/identity.js";
import { ALICE, resetDatabase, startApp } from "./helpers.js";

/**
 * Link previews for reviews.
 *
 * The failure this guards against is silent by nature: nobody sees a missing or
 * wrong meta tag except the chat client that renders it, and only once the link
 * has already been pasted. So the tags are asserted literally rather than by
 * "contains og:title".
 */

interface Seeded {
  slug: string;
  id: string;
}

async function seedReview(options: {
  title: string;
  rating?: number;
  content?: string;
  coverUrl?: string | null;
}): Promise<Seeded> {
  const user = await provisionUser(ALICE);
  const game = await prisma.game.create({
    data: {
      title: options.title,
      slug: slugify(options.title, "game"),
      coverUrl: options.coverUrl === undefined ? "https://media.rawg.io/cover.jpg" : options.coverUrl,
    },
  });
  const review = await prisma.review.create({
    data: {
      rating: options.rating ?? 8,
      content: options.content ?? "It was good.",
      yearPlayed: 2024,
      hoursPlayed: 12,
      slug: `${game.slug}-by-${user.username}`,
      gameId: game.id,
      userId: user.id,
    },
  });
  return { slug: review.slug, id: review.id };
}

/** The `content` of a `<meta>` identified by either attribute name. */
function meta(html: string, key: string): string | undefined {
  const pattern = new RegExp(
    `<meta (?:property|name)="${key}" content="([^"]*)">`
  );
  return pattern.exec(html)?.[1];
}

describe("review link previews", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("serves Open Graph tags for a review, with no session", async () => {
    const { slug } = await seedReview({
      title: "Elden Ring",
      rating: 9.5,
      content: "Best of its kind.",
    });

    const res = await request(app).get(`/reviews/${slug}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(meta(res.text, "og:title")).toBe("Elden Ring — 9.5/10 by alice");
    expect(meta(res.text, "og:description")).toBe("Best of its kind.");
    expect(meta(res.text, "og:type")).toBe("article");
    expect(meta(res.text, "og:site_name")).toBe("GameReviews");
    expect(meta(res.text, "og:image")).toBe("https://media.rawg.io/cover.jpg");
    expect(meta(res.text, "twitter:card")).toBe("summary_large_image");
  });

  it("points the canonical URL at the slug even when asked for by UUID", async () => {
    const { slug, id } = await seedReview({ title: "Hades" });

    const res = await request(app).get(`/reviews/${id}`).set("Host", "reviews.example.com");

    expect(res.status).toBe(200);
    expect(meta(res.text, "og:url")).toBe(`http://reviews.example.com/reviews/${slug}`);
  });

  it("prefers PUBLIC_ORIGIN over the Host header when it is set", async () => {
    const { slug } = await seedReview({ title: "Hades" });
    process.env["PUBLIC_ORIGIN"] = "https://reviews.example.com/";
    try {
      const res = await request(app).get(`/reviews/${slug}`).set("Host", "attacker.example");
      expect(meta(res.text, "og:url")).toBe(`https://reviews.example.com/reviews/${slug}`);
    } finally {
      delete process.env["PUBLIC_ORIGIN"];
    }
  });

  it("omits the image tags for a game with no cover", async () => {
    const { slug } = await seedReview({ title: "Some Indie", coverUrl: null });

    const res = await request(app).get(`/reviews/${slug}`);

    // An og:image pointing at nothing makes some clients drop the embed whole.
    expect(res.text).not.toContain("og:image");
    expect(meta(res.text, "twitter:card")).toBe("summary");
  });

  it("escapes a title that would otherwise close the attribute", async () => {
    const { slug } = await seedReview({
      title: 'Portal" ><script>alert(1)</script>',
    });

    const res = await request(app).get(`/reviews/${slug}`);

    expect(res.text).not.toContain("<script>");
    expect(res.text).toContain("&quot;");
  });

  it("answers a link to a review that is not there", async () => {
    const res = await request(app).get("/reviews/no-such-review");

    expect(res.status).toBe(404);
    expect(meta(res.text, "og:title")).toBe("Review not found — GameReviews");
  });

  it("lets a shared cache hold a preview", async () => {
    const { slug } = await seedReview({ title: "Hades" });

    const res = await request(app).get(`/reviews/${slug}`);

    // Nothing here varies by cookie, and one paste in a busy channel is fetched
    // once per client that saw it.
    expect(res.headers["cache-control"]).toContain("public");
  });
});

describe("embedDescription", () => {
  it("redacts spoilers rather than stripping the markers", () => {
    // The one place a spoiler is read by someone who did not ask for it: an
    // unfurl has no click-to-reveal to hide behind.
    expect(embedDescription("Then ||the dog dies|| and it ends.")).toBe(
      "Then [spoiler] and it ends."
    );
  });

  it("strips markdown down to one line", () => {
    expect(embedDescription("# Title\n\n**Bold** and [a link](https://x.test).")).toBe(
      "Title Bold and a link."
    );
  });

  it("truncates on a word boundary", () => {
    const text = embedDescription("word ".repeat(200), 40);
    expect(text.length).toBeLessThanOrEqual(41);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("wor…");
  });

  it("leaves a short body alone", () => {
    expect(embedDescription("Short.")).toBe("Short.");
  });
});

describe("escapeHtml", () => {
  it("escapes every character that could end an attribute or open a tag", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});
