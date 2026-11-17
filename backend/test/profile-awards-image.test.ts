import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import { provisionUser } from "../src/lib/identity.js";
import { parseImageFile } from "../src/lib/awardsImage.js";
import { ALICE, resetDatabase, startApp } from "./helpers.js";

/** Covers are left null so nothing here reaches a CDN: tiles draw placeholders. */
async function seedYear(
  userId: string,
  year: number,
  entries: { ranked?: string[]; awards?: [string, string][] },
): Promise<void> {
  const gameId = async (title: string) =>
    (
      await prisma.game.upsert({
        where: { slug: slugify(title, "game") },
        create: { title, slug: slugify(title, "game") },
        update: {},
      })
    ).id;
  for (const [i, title] of (entries.ranked ?? []).entries()) {
    await prisma.awardRank.create({
      data: { userId, year, rank: i + 1, gameId: await gameId(title) },
    });
  }
  for (const [position, [name, title]] of (entries.awards ?? []).entries()) {
    await prisma.awardCategory.create({
      data: { userId, year, position, name, gameId: await gameId(title) },
    });
  }
}

/** A fixed Host: the site is printed on the image, so it is part of the ETag. */
let get: (path: string) => request.Test;

/** Width and height from the IHDR chunk, which always comes first. */
function pngSize(body: Buffer): { width: number; height: number } {
  expect(body.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

describe("a year's awards as an image", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let user: { id: string; slug: string };

  beforeAll(async () => {
    ({ app, stop } = await startApp());
    get = (path) => request(app).get(path).set("Host", "reviews.example.com");
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await resetDatabase();
    user = await provisionUser(ALICE);
  });

  it("draws the download at 1080×1350 for any user agent", async () => {
    await seedYear(user.id, 2026, {
      ranked: ["Hollow Knight", "Shogun Showdown"],
      awards: [["Best Soundtrack", "Celeste"]],
    });

    const res = await get(`/users/${user.slug}/awards/2026.png`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(res.headers["content-disposition"]).toBe(
      `inline; filename="${user.slug}-2026-awards.png"`,
    );
    expect(pngSize(res.body as Buffer)).toEqual({ width: 1080, height: 1350 });
  });

  it("draws the preview at 1200×630", async () => {
    await seedYear(user.id, 2026, { ranked: ["Hollow Knight"] });

    const res = await get(`/users/${user.slug}/awards/2026-wide.png`);

    expect(res.status).toBe(200);
    expect(pngSize(res.body as Buffer)).toEqual({ width: 1200, height: 630 });
  });

  it("draws a full year of thirty entries", async () => {
    const titles = Array.from({ length: 30 }, (_, i) => `Game ${i}`);
    await seedYear(user.id, 2026, {
      ranked: titles.slice(0, 10),
      awards: titles
        .slice(10)
        .map((title, i): [string, string] => [`Award number ${i}`, title]),
    });

    const res = await get(`/users/${user.slug}/awards/2026.png`);

    expect(res.status).toBe(200);
    expect(pngSize(res.body as Buffer)).toEqual({ width: 1080, height: 1350 });
  });

  it("draws a year with awards but no ranking", async () => {
    await seedYear(user.id, 2026, { awards: [["Best Story", "OMORI"]] });

    for (const file of ["2026.png", "2026-wide.png"]) {
      const res = await get(`/users/${user.slug}/awards/${file}`);
      expect(res.status).toBe(200);
    }
  });

  it("has no image for a year with nothing in it", async () => {
    await seedYear(user.id, 2025, { ranked: ["Hollow Knight"] });

    const res = await get(`/users/${user.slug}/awards/2026.png`);

    expect(res.status).toBe(404);
  });

  it("has no image for an account that does not exist", async () => {
    const res = await get("/users/nobody/awards/2026.png");

    expect(res.status).toBe(404);
  });

  it("answers a repeat request with 304 until the year changes", async () => {
    await seedYear(user.id, 2026, { ranked: ["Hollow Knight"] });
    const path = `/users/${user.slug}/awards/2026.png`;

    const first = await get(path);
    const etag = first.headers["etag"];
    expect(etag).toBeTruthy();
    expect(first.headers["cache-control"]).toBe("public, no-cache");

    const again = await get(path).set("If-None-Match", etag ?? "");
    expect(again.status).toBe(304);

    await seedYear(user.id, 2026, { awards: [["Best Story", "OMORI"]] });
    const changed = await get(path).set("If-None-Match", etag ?? "");
    expect(changed.status).toBe(200);
    expect(changed.headers["etag"]).not.toBe(etag);
  });

  it("is redrawn when the owner changes palette", async () => {
    await seedYear(user.id, 2026, { ranked: ["Hollow Knight"] });
    const path = `/users/${user.slug}/awards/2026.png`;
    const before = await get(path);

    await prisma.user.update({
      where: { id: user.id },
      data: { palette: "paper" },
    });
    const after = await get(path);

    expect(after.headers["etag"]).not.toBe(before.headers["etag"]);
    expect(
      Buffer.compare(after.body as Buffer, before.body as Buffer),
    ).not.toBe(0);
  });

  it("gives the two sizes different ETags", async () => {
    await seedYear(user.id, 2026, { ranked: ["Hollow Knight"] });

    const portrait = await get(`/users/${user.slug}/awards/2026.png`);
    const wide = await get(`/users/${user.slug}/awards/2026-wide.png`);

    expect(portrait.headers["etag"]).not.toBe(wide.headers["etag"]);
  });

  it("leaves a path that is not an image to the link preview", async () => {
    await seedYear(user.id, 2026, { ranked: ["Hollow Knight"] });

    const res = await get(`/users/${user.slug}/awards/2026`);

    expect(res.headers["content-type"]).toContain("text/html");
  });
});

describe("parseImageFile", () => {
  it.each([
    ["2026.png", { year: 2026, kind: "portrait" }],
    ["2026-wide.png", { year: 2026, kind: "wide" }],
  ])("reads %s", (file, expected) => {
    expect(parseImageFile(file)).toEqual(expected);
  });

  it.each(["2026", "2026.jpg", "26.png", "2026-tall.png", "x2026.png"])(
    "refuses %s",
    (file) => {
      expect(parseImageFile(file)).toBeNull();
    },
  );
});
