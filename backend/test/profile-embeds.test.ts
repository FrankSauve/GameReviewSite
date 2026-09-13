import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import {
  embedFavoritesDescription,
  embedFavoritesTitle,
  embedProfileDescription,
  embedProfileTitle,
} from "../src/lib/embed.js";
import { labelFor } from "../src/lib/favoriteCategories.js";
import { provisionUser } from "../src/lib/identity.js";
import { ALICE, type Identity, resetDatabase, startApp } from "./helpers.js";

/**
 * Link previews for user profiles, the counterpart to review-embeds.ts. The
 * same reasoning applies: nobody sees a wrong meta tag except the chat client
 * rendering it, so the tags are asserted literally.
 */

interface Seeded {
  slug: string;
  id: string;
}

async function seedProfile(options: {
  identity?: Identity;
  bio?: string | null;
  reviews?: number;
}): Promise<Seeded> {
  const user = await provisionUser(options.identity ?? ALICE);
  if (options.bio !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: { bio: options.bio },
    });
  }
  for (let n = 0; n < (options.reviews ?? 0); n++) {
    const title = `Game ${n}`;
    const game = await prisma.game.create({
      data: { title, slug: slugify(title, "game") },
    });
    await prisma.review.create({
      data: {
        rating: 8,
        content: "It was good.",
        yearPlayed: 2024,
        hoursPlayed: 12,
        slug: `${user.slug}/${game.slug}`,
        gameId: game.id,
        userId: user.id,
      },
    });
  }
  return { slug: user.slug, id: user.id };
}

/** Straight to the table: the "only a game you reviewed" rule is the mutation's. */
async function seedFavorites(
  userId: string,
  picks: { category: string; title: string; coverUrl?: string }[],
): Promise<void> {
  for (const pick of picks) {
    const game = await prisma.game.create({
      data: {
        title: pick.title,
        slug: slugify(pick.title, "game"),
        ...(pick.coverUrl === undefined ? {} : { coverUrl: pick.coverUrl }),
      },
    });
    await prisma.favoriteGame.create({
      data: { userId, category: pick.category, gameId: game.id },
    });
  }
}

/** The `content` of a `<meta>` identified by either attribute name. */
function meta(html: string, key: string): string | undefined {
  const pattern = new RegExp(
    `<meta (?:property|name)="${key}" content="([^"]*)">`,
  );
  return pattern.exec(html)?.[1];
}

describe("profile link previews", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("serves Open Graph tags for a profile, with no session", async () => {
    const { slug } = await seedProfile({
      bio: "I mostly play **RPGs**.",
      reviews: 2,
    });

    const res = await request(app).get(`/users/${slug}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(meta(res.text, "og:title")).toBe("alice — 2 reviews");
    expect(meta(res.text, "og:description")).toBe("I mostly play RPGs.");
    expect(meta(res.text, "og:type")).toBe("profile");
    expect(meta(res.text, "og:site_name")).toBe("GameReviews");
    expect(meta(res.text, "twitter:title")).toBe("alice — 2 reviews");
    expect(meta(res.text, "twitter:description")).toBe("I mostly play RPGs.");
    expect(meta(res.text, "theme-color")).toBe("#8b5cf6");
  });

  it("carries no image tags at all", async () => {
    // Settled: there is no per-profile image and no site banner, and an
    // og:image pointing at nothing makes some clients drop the embed whole.
    const { slug } = await seedProfile({ bio: "Hello." });

    const res = await request(app).get(`/users/${slug}`);

    expect(res.text).not.toContain("og:image");
    expect(meta(res.text, "twitter:card")).toBe("summary");
  });

  it("names a profile with no reviews in the singular past one", async () => {
    const { slug } = await seedProfile({ reviews: 1 });

    const res = await request(app).get(`/users/${slug}`);

    expect(meta(res.text, "og:title")).toBe("alice — 1 review");
  });

  it("gives a profile with no bio a line rather than an empty tag", async () => {
    const { slug } = await seedProfile({ bio: null });

    const res = await request(app).get(`/users/${slug}`);

    expect(meta(res.text, "og:description")).toBe(
      "alice has not written a bio yet.",
    );
  });

  it("points the canonical URL at the slug even when asked for by UUID", async () => {
    const { slug, id } = await seedProfile({});

    const res = await request(app)
      .get(`/users/${id}`)
      .set("Host", "reviews.example.com");

    expect(res.status).toBe(200);
    expect(meta(res.text, "og:url")).toBe(
      `http://reviews.example.com/users/${slug}`,
    );
  });

  it("prefers PUBLIC_ORIGIN over the Host header when it is set", async () => {
    const { slug } = await seedProfile({});
    process.env["PUBLIC_ORIGIN"] = "https://reviews.example.com/";
    try {
      const res = await request(app)
        .get(`/users/${slug}`)
        .set("Host", "attacker.example");
      expect(meta(res.text, "og:url")).toBe(
        `https://reviews.example.com/users/${slug}`,
      );
    } finally {
      delete process.env["PUBLIC_ORIGIN"];
    }
  });

  it("unfurls a profile tab as the profile itself", async () => {
    // /users/<slug>/recent and its siblings are real SPA routes, so they get
    // pasted; the canonical URL is still the profile.
    const { slug } = await seedProfile({ reviews: 1 });

    const res = await request(app).get(`/users/${slug}/by-score`);

    expect(res.status).toBe(200);
    expect(meta(res.text, "og:title")).toBe("alice — 1 review");
    expect(meta(res.text, "og:url")).toContain(`/users/${slug}`);
  });

  it("escapes a username and a bio that would otherwise close the attribute", async () => {
    const { slug } = await seedProfile({
      identity: {
        uid: "ak-hostile",
        username: 'mal" ><script>alert(1)</script>',
        email: "mal@example.com",
      },
      bio: 'Bio" ><img src=x onerror=alert(1)>',
    });

    const res = await request(app).get(`/users/${slug}`);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<script>");
    expect(res.text).not.toContain("<img src=x");
    expect(res.text).toContain("&quot;");
  });

  it("answers a link to a profile that is not there", async () => {
    const res = await request(app).get("/users/no-such-user");

    expect(res.status).toBe(404);
    expect(meta(res.text, "og:title")).toBe("Profile not found — GameReviews");
    expect(meta(res.text, "og:type")).toBe("profile");
  });

  it("answers a path under /users that is not a profile at all", async () => {
    for (const path of ["/users/", "/users/a/b/c"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(meta(res.text, "og:title")).toBe(
        "Profile not found — GameReviews",
      );
    }
  });

  it("unfurls the favourites tab as the picks themselves", async () => {
    const { slug, id } = await seedProfile({ bio: "I mostly play RPGs." });
    await seedFavorites(id, [
      {
        category: "favorite-game",
        title: "Elden Ring",
        coverUrl: "https://media.rawg.io/elden-ring.jpg",
      },
      { category: "best-story", title: "Disco Elysium" },
    ]);

    const res = await request(app).get(`/users/${slug}/favorites`);

    expect(res.status).toBe(200);
    // meta() reads the attribute as written, apostrophe still escaped.
    expect(meta(res.text, "og:title")).toBe("alice&#39;s favourites — 2 picks");
    expect(meta(res.text, "og:description")).toBe(
      "Favourite Game: Elden Ring · Best Story: Disco Elysium",
    );
    expect(meta(res.text, "og:type")).toBe("profile");
    expect(meta(res.text, "og:image")).toBe(
      "https://media.rawg.io/elden-ring.jpg",
    );
    expect(meta(res.text, "twitter:card")).toBe("summary_large_image");
    expect(meta(res.text, "og:url")).toContain(`/users/${slug}/favorites`);
  });

  it("lists the picks in grid order, not the order they were picked", async () => {
    const { slug, id } = await seedProfile({});
    await seedFavorites(id, [
      { category: "worst-game", title: "Wet" },
      { category: "favorite-game", title: "Elden Ring" },
      { category: "best-story", title: "Disco Elysium" },
    ]);

    const res = await request(app).get(`/users/${slug}/favorites`);

    expect(meta(res.text, "og:description")).toBe(
      "Favourite Game: Elden Ring · Best Story: Disco Elysium · Worst Game: Wet",
    );
  });

  it("takes the cover from the first pick that has one", async () => {
    const { slug, id } = await seedProfile({});
    await seedFavorites(id, [
      { category: "favorite-game", title: "Hand Added Game" },
      {
        category: "best-story",
        title: "Disco Elysium",
        coverUrl: "https://media.rawg.io/disco.jpg",
      },
    ]);

    const res = await request(app).get(`/users/${slug}/favorites`);

    expect(meta(res.text, "og:image")).toBe("https://media.rawg.io/disco.jpg");
  });

  it("carries no image tags when no pick has a cover", async () => {
    const { slug, id } = await seedProfile({});
    await seedFavorites(id, [
      { category: "favorite-game", title: "Hand Added Game" },
    ]);

    const res = await request(app).get(`/users/${slug}/favorites`);

    expect(res.text).not.toContain("og:image");
    expect(meta(res.text, "twitter:card")).toBe("summary");
  });

  it("falls back to the profile embed when the grid is empty", async () => {
    const { slug } = await seedProfile({ bio: "Hello.", reviews: 1 });

    // A fixed Host on both: each request binds its own ephemeral port otherwise.
    const favorites = await request(app)
      .get(`/users/${slug}/favorites`)
      .set("Host", "reviews.example.com");
    const profile = await request(app)
      .get(`/users/${slug}`)
      .set("Host", "reviews.example.com");

    expect(favorites.status).toBe(200);
    expect(favorites.text).toBe(profile.text);
  });

  it("points the favourites URL at the slug even when asked for by UUID", async () => {
    const { slug, id } = await seedProfile({});
    await seedFavorites(id, [
      { category: "favorite-game", title: "Elden Ring" },
    ]);

    const res = await request(app)
      .get(`/users/${id}/favorites`)
      .set("Host", "reviews.example.com");

    expect(meta(res.text, "og:url")).toBe(
      `http://reviews.example.com/users/${slug}/favorites`,
    );
  });

  it("escapes a game title that would otherwise close the attribute", async () => {
    const { slug, id } = await seedProfile({});
    await seedFavorites(id, [
      {
        category: "favorite-game",
        title: 'Game" ><script>alert(1)</script>',
      },
    ]);

    const res = await request(app).get(`/users/${slug}/favorites`);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<script>");
    expect(res.text).toContain("&quot;");
  });

  it("leaves the ordering tabs unfurling as the profile", async () => {
    const { slug, id } = await seedProfile({ reviews: 1 });
    await seedFavorites(id, [
      { category: "favorite-game", title: "Elden Ring" },
    ]);

    for (const tab of ["by-score", "recent", "by-year"]) {
      const res = await request(app).get(`/users/${slug}/${tab}`);
      expect(meta(res.text, "og:title")).toBe("alice — 1 review");
    }
  });

  it("lets a shared cache hold a preview", async () => {
    const { slug } = await seedProfile({});

    const res = await request(app).get(`/users/${slug}`);

    expect(res.headers["cache-control"]).toContain("public");
  });
});

describe("embedProfileTitle", () => {
  it("puts the review count in the line every client renders", () => {
    expect(embedProfileTitle("alice", 42)).toBe("alice — 42 reviews");
    expect(embedProfileTitle("alice", 1)).toBe("alice — 1 review");
    expect(embedProfileTitle("alice", 0)).toBe("alice — 0 reviews");
  });
});

describe("embedProfileDescription", () => {
  it("strips markdown and redacts spoilers from a bio", () => {
    expect(
      embedProfileDescription("alice", "I like **RPGs** and ||twists||."),
    ).toBe("I like RPGs and [spoiler].");
  });

  it("falls back for a bio that is absent or reduces to nothing", () => {
    const fallback = "alice has not written a bio yet.";
    expect(embedProfileDescription("alice", null)).toBe(fallback);
    expect(embedProfileDescription("alice", "   ")).toBe(fallback);
    expect(embedProfileDescription("alice", "---")).toBe(fallback);
  });

  it("truncates a bio written up to the 3000-character cap", () => {
    // The cap the previous change raised; the description budget is unchanged,
    // so the longest bio still has to come back as one short line.
    const text = embedProfileDescription("alice", "word ".repeat(600));
    expect(text.length).toBeLessThanOrEqual(300);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("wor…");
  });

  it("truncates a bio with no spaces in it", () => {
    const text = embedProfileDescription("alice", "x".repeat(3000));
    expect(text.length).toBe(300);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("embedFavoritesTitle", () => {
  it("counts the filled tiles, not the categories the grid draws", () => {
    expect(embedFavoritesTitle("alice", 7)).toBe(
      "alice's favourites — 7 picks",
    );
    expect(embedFavoritesTitle("alice", 1)).toBe("alice's favourites — 1 pick");
  });
});

describe("embedFavoritesDescription", () => {
  const pick = (category: string, gameTitle: string) => ({
    category,
    gameTitle,
  });

  it("labels each pick and joins them", () => {
    expect(
      embedFavoritesDescription([
        pick("favorite-game", "Elden Ring"),
        pick("best-story", "Disco Elysium"),
      ]),
    ).toBe("Favourite Game: Elden Ring · Best Story: Disco Elysium");
  });

  it("leaves a game title exactly as it was written", () => {
    expect(
      embedFavoritesDescription([
        pick("favorite-game", "*Hack"),
        pick("best-story", "_transistor_"),
      ]),
    ).toBe("Favourite Game: *Hack · Best Story: _transistor_");
  });

  it("flattens a title written over more than one line", () => {
    expect(
      embedFavoritesDescription([
        pick("favorite-game", "Nier:\nAutomata"),
        pick("best-story", "Disco   Elysium"),
      ]),
    ).toBe("Favourite Game: Nier: Automata · Best Story: Disco Elysium");
  });

  it("drops whole picks rather than cutting a game title in half", () => {
    const picks = Array.from({ length: 20 }, (_, n) =>
      pick("favorite-game", `A Game With Quite A Long Title ${n}`),
    );

    const text = embedFavoritesDescription(picks);

    expect(text.length).toBeLessThanOrEqual(300);
    expect(text.endsWith(" …")).toBe(true);
    for (const entry of text.slice(0, -2).split(" · ")) {
      expect(entry).toMatch(
        /^Favourite Game: A Game With Quite A Long Title \d+$/,
      );
    }
  });

  it("cuts into the first pick only when that pick alone overruns", () => {
    const text = embedFavoritesDescription([
      pick("favorite-game", "word ".repeat(100)),
      pick("best-story", "Disco Elysium"),
    ]);

    expect(text.length).toBeLessThanOrEqual(300);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("Disco Elysium");
  });

  it("says nothing at all for no picks", () => {
    expect(embedFavoritesDescription([])).toBe("");
  });
});

describe("labelFor", () => {
  it("labels a known category", () => {
    expect(labelFor("favorite-game")).toBe("Favourite Game");
  });

  it("falls back to the key it does not know", () => {
    expect(labelFor("best-loading-screen")).toBe("best-loading-screen");
  });

  it("agrees with the grid's copy of the labels", () => {
    // Read as text, not imported: the frontend is outside this compilation.
    const source = readFileSync(
      new URL("../../frontend/src/lib/favoriteCategories.ts", import.meta.url),
      "utf8",
    );
    const pairs = [
      ...source.matchAll(/\{ key: "([^"]+)", label: "([^"]+)" \}/g),
    ].map(([, key, label]) => [key, label] as const);

    expect(pairs.length).toBe(20);
    for (const [key, label] of pairs) {
      expect(labelFor(key ?? "")).toBe(label);
    }
  });
});
