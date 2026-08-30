import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { ALICE, authedQuery, resetDatabase, seedGame, startApp } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { REVIEW_CONTENT_MAX } from "../src/resolvers/review.js";

/**
 * Review bodies are Markdown, and the backlog being imported spans a decade, so
 * the limit is 20000 rather than the original 5000.
 *
 * The backend stores the Markdown source and never renders it — rendering is the
 * SPA's job, and keeping the source is what makes the text portable. So there is
 * nothing here about formatting, only about length and about the source surviving
 * the round trip unaltered.
 */
describe("review body", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let gameId: string;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await resetDatabase();
    gameId = await seedGame("Long Game");
  });

  const create = (content: string) =>
    authedQuery(
      app,
      "mutation ($input: CreateReviewInput!) { createReview(input: $input) { id content } }",
      ALICE,
      {},
      { input: { gameId, rating: 8, content, yearPlayed: 2024, hoursPlayed: 12 } }
    );

  it("accepts a body at the limit", async () => {
    const res = await create("x".repeat(REVIEW_CONTENT_MAX));
    expect(res.errors).toBeUndefined();
    expect(await prisma.review.count()).toBe(1);
  });

  it("refuses a body over the limit", async () => {
    const res = await create("x".repeat(REVIEW_CONTENT_MAX + 1));
    expect(res.errors?.[0]?.message).toContain(`at most ${REVIEW_CONTENT_MAX}`);
    expect(await prisma.review.count()).toBe(0);
  });

  it("accepts what the old 5000-character limit would have refused", async () => {
    const res = await create("x".repeat(8000));
    expect(res.errors).toBeUndefined();
  });

  it("still refuses an empty body", async () => {
    const res = await create("   \n  ");
    expect(res.errors?.[0]?.message).toContain("must not be empty");
  });

  /**
   * The API must not touch the Markdown. Escaping, normalising or stripping any of
   * this server-side would corrupt the stored source, and the renderer already
   * treats raw HTML as inert text rather than markup.
   */
  it("stores Markdown syntax verbatim", async () => {
    const body = [
      "## Verdict",
      "",
      "**Superb** but *flawed*. See [the wiki](https://example.com/a_b).",
      "",
      "- one",
      "- two",
      "",
      "> quoted",
      "",
      "```sh",
      "npm test",
      "```",
      "",
      "Not markup: <script>alert(1)</script> & an ampersand.",
    ].join("\n");

    const res = await create(body);
    expect(res.errors).toBeUndefined();
    expect((res.data?.createReview as { content: string }).content).toBe(body);

    const stored = await prisma.review.findFirst();
    expect(stored?.content).toBe(body);
  });

  /** Interior newlines must survive; only the outer edges are trimmed. */
  it("trims the ends without collapsing the middle", async () => {
    const res = await create("\n\n  first\n\nsecond  \n\n");
    expect((res.data?.createReview as { content: string }).content).toBe(
      "first\n\nsecond"
    );
  });
});

/**
 * Rows became the wrong unit when a body grew from 5000 characters to 20000.
 *
 * Measured before this guard existed: `reviews { content user { reviews
 * { content } } }` at 30 and 30 is 930 rows — comfortably inside the 3000-row
 * budget — and returned 18.66 MB, worse than the 2.6 MB that motivated the row
 * budget in the first place. The text budget is what keeps the ceiling flat
 * whatever shape asks for it.
 */
describe("review body text budget", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  /** `count` games, one maximal review each, all by the same author. */
  const seedMaximalReviews = async (count: number) => {
    const user = await prisma.user.create({
      data: { authentikUid: "ak-bulk", username: "bulk", slug: "bulk" },
    });
    const content = "x".repeat(REVIEW_CONTENT_MAX);
    for (let i = 0; i < count; i++) {
      const game = await prisma.game.create({
        data: { title: `Game ${i}`, slug: `game-${i}` },
      });
      await prisma.review.create({
        data: {
          slug: `${user.username}/${game.slug}`,
          userId: user.id,
          gameId: game.id,
          rating: 8,
          content,
        },
      });
    }
  };

  it("refuses a shape the row budget alone would have allowed", async () => {
    await seedMaximalReviews(30);
    const res = await authedQuery(
      app,
      "{ reviews(limit: 30) { id content user { id reviews(limit: 30) { id content } } } }"
    );
    expect(res.errors?.map((e) => e.extensions?.code)).toContain("QUERY_TOO_LARGE");
  });

  it("names review text rather than records, so the cause is findable", async () => {
    await seedMaximalReviews(30);
    const res = await authedQuery(
      app,
      "{ reviews(limit: 30) { id content user { id reviews(limit: 30) { id content } } } }"
    );
    expect(res.errors?.[0]?.message).toContain("characters of review text");
  });

  /** The same shape without bodies is cheap and must stay allowed. */
  it("allows the same row count when no body is requested", async () => {
    await seedMaximalReviews(30);
    const res = await authedQuery(
      app,
      "{ reviews(limit: 30) { id rating user { id reviews(limit: 30) { id rating } } } }"
    );
    expect(res.errors).toBeUndefined();
  });

  /** The widest page the SPA legitimately asks for: a game's reviews, with bodies. */
  it("allows a full page of maximal reviews", async () => {
    await seedMaximalReviews(50);
    const res = await authedQuery(app, "{ reviews(limit: 50) { id content } }");
    expect(res.errors).toBeUndefined();
    expect((res.data?.reviews as unknown[]).length).toBe(50);
  });
});
