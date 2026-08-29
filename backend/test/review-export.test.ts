import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import { formatReview } from "../src/lib/exportMarkdown.js";
import {
  ALICE,
  BOB,
  resetDatabase,
  sessionFor,
  startApp,
  type Identity,
} from "./helpers.js";

/**
 * The markdown export.
 *
 * Two things can go wrong here that nothing else in the suite would catch: the
 * file could contain somebody else's reviews, and it could be quietly
 * incomplete. Both produce a download that looks perfectly fine.
 */

const EXPORT_PATH = "/export/reviews.md";

interface SeedReview {
  title: string;
  rating?: number;
  hoursPlayed?: number | null;
  content?: string;
  createdAt?: Date;
}

async function seedReview(identity: Identity, review: SeedReview): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { username: identity.username },
  });
  const game = await prisma.game.create({
    data: { title: review.title, slug: slugify(review.title, "game") },
  });
  await prisma.review.create({
    data: {
      rating: review.rating ?? 8,
      content: review.content ?? "It was good.",
      yearPlayed: 2024,
      hoursPlayed: review.hoursPlayed === undefined ? 12 : review.hoursPlayed,
      slug: `${game.slug}-by-${user.username}`,
      gameId: game.id,
      userId: user.id,
      ...(review.createdAt ? { createdAt: review.createdAt } : {}),
    },
  });
}

describe("exporting reviews as markdown", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("refuses an anonymous request", async () => {
    const res = await request(app).get(EXPORT_PATH);
    expect(res.status).toBe(401);
  });

  it("offers the file as a download named after the account", async () => {
    const cookie = await sessionFor(ALICE);
    const res = await request(app).get(EXPORT_PATH).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="reviews-alice.md"'
    );
    // A shared cache holding one account's reviews would serve them to another.
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  it("writes a review in the format the issue specifies", async () => {
    const cookie = await sessionFor(ALICE);
    await seedReview(ALICE, {
      title: "Elden Ring",
      rating: 9.5,
      hoursPlayed: 120,
      content: "Best of its kind.",
    });

    const res = await request(app).get(EXPORT_PATH).set("Cookie", cookie);
    expect(res.text).toBe(
      "# Elden Ring\n**Score:** 9.5\n**Playtime:** 120 hrs\n\nBest of its kind.\n"
    );
  });

  it("leaves the playtime line out when there are no hours recorded", async () => {
    const cookie = await sessionFor(ALICE);
    await seedReview(ALICE, { title: "Old Import", hoursPlayed: null });

    const res = await request(app).get(EXPORT_PATH).set("Cookie", cookie);
    expect(res.text).not.toContain("Playtime");
    expect(res.text).toContain("**Score:**");
  });

  it("exports only the signed-in account's own reviews", async () => {
    const cookie = await sessionFor(ALICE);
    await sessionFor(BOB);
    await seedReview(ALICE, { title: "Mine" });
    await seedReview(BOB, { title: "Not Mine" });

    const res = await request(app).get(EXPORT_PATH).set("Cookie", cookie);
    expect(res.text).toContain("# Mine");
    expect(res.text).not.toContain("Not Mine");
  });

  /**
   * The export reads in batches, so the boundary between them is where a review
   * would go missing or be written twice. A backlog imported in one sitting is
   * also the case where every row shares a `createdAt`, which is what the id
   * tiebreaker in the ordering is for: without it the batches are windows onto
   * two different orderings.
   */
  it("writes every review exactly once across batch boundaries", async () => {
    const cookie = await sessionFor(ALICE);
    const at = new Date("2026-01-01T00:00:00.000Z");
    const titles = Array.from({ length: 120 }, (_, i) => `Game ${i + 1}`);
    for (const title of titles) {
      await seedReview(ALICE, { title, createdAt: at });
    }

    const res = await request(app).get(EXPORT_PATH).set("Cookie", cookie);
    const headings = [...res.text.matchAll(/^# (.+)$/gm)].map((m) => m[1]);

    expect(headings).toHaveLength(120);
    expect([...new Set(headings)].sort()).toEqual([...titles].sort());
  });

  it("separates reviews with a rule that cannot be read as a heading", async () => {
    const cookie = await sessionFor(ALICE);
    await seedReview(ALICE, { title: "First", content: "One." });
    await seedReview(ALICE, { title: "Second", content: "Two." });

    const res = await request(app).get(EXPORT_PATH).set("Cookie", cookie);
    // A `---` directly under a line of text underlines it into a heading. The
    // blank line above is what keeps the body a body.
    expect(res.text).toContain("\n\n---\n\n");
    expect(res.text).not.toMatch(/[^\n]\n---/);
  });

  it("returns an empty file rather than an error for an account with no reviews", async () => {
    const cookie = await sessionFor(ALICE);
    const res = await request(app).get(EXPORT_PATH).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.text).toBe("");
  });
});

describe("formatReview", () => {
  const base = { gameTitle: "Terraria", rating: 8, content: "Dug a hole." };

  it("writes a whole score without a trailing zero", () => {
    expect(formatReview({ ...base, hoursPlayed: 40 })).toContain("**Score:** 8\n");
  });

  it("keeps the half point on a half score", () => {
    expect(formatReview({ ...base, rating: 7.5, hoursPlayed: 40 })).toContain(
      "**Score:** 7.5\n"
    );
  });

  it("does not print 40.0 hours", () => {
    expect(formatReview({ ...base, hoursPlayed: 40 })).toContain("**Playtime:** 40 hrs");
    expect(formatReview({ ...base, hoursPlayed: 40.5 })).toContain(
      "**Playtime:** 40.5 hrs"
    );
  });

  /** Every section ends in exactly one newline, so the separator between two of
   *  them is the same shape no matter how the body was typed. */
  it("normalises the whitespace around the body", () => {
    const section = formatReview({ ...base, content: "\n\nDug a hole.\n\n\n" });
    expect(section.endsWith("Dug a hole.\n")).toBe(true);
  });
});
