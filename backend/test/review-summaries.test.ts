import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { ALICE, authedQuery, publicQuery, resetDatabase, startApp } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { LIST_BOUNDS } from "../src/lib/pagination.js";
import { REVIEW_CONTENT_MAX } from "../src/resolvers/review.js";

/**
 * The compact per-user review list behind the grouped profile views.
 *
 * It exists because `User.reviews` cannot serve them: bounded at 50 by default and
 * 100 at most, a fifty-review backlog already truncates, and raising that bound
 * would undo the reason it is low — the body. This carries no body, so it can be
 * bounded at 500 and still be small.
 */
describe("reviewSummariesByUser", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let userId: string;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  /** Reviews described as [rating, yearPlayed | null], newest written last. */
  const seed = async (rows: [number, number | null][]) => {
    const user = await prisma.user.create({
      data: { authentikUid: ALICE.uid, username: ALICE.username },
    });
    userId = user.id;
    for (const [rating, yearPlayed] of rows) {
      const game = await prisma.game.create({
        data: { title: `Game ${rating}-${yearPlayed ?? "none"}` },
      });
      await prisma.review.create({
        data: {
          userId: user.id,
          gameId: game.id,
          rating,
          yearPlayed,
          hoursPlayed: 10,
          content: "body",
        },
      });
    }
  };

  const query = (args: string, fields = "id rating yearPlayed") =>
    publicQuery<{ reviewSummariesByUser: Record<string, unknown>[] }>(
      app,
      `{ reviewSummariesByUser(userId: "${userId}", ${args}) { ${fields} } }`
    );

  it("is readable without an account, like the reviews themselves", async () => {
    await seed([[8, 2020]]);
    const res = await query("order: RECENT");
    expect(res.errors).toBeUndefined();
    expect(res.data?.reviewSummariesByUser).toHaveLength(1);
  });

  it("has no content field to ask for", async () => {
    await seed([[8, 2020]]);
    const res = await query("order: RECENT", "id content");
    expect(res.errors?.[0]?.message).toMatch(/content/i);
  });

  describe("ordering", () => {
    it("orders by score, highest first", async () => {
      await seed([
        [6, 2020],
        [10, 2019],
        [8.5, 2021],
      ]);
      const res = await query("order: RATING_DESC");
      expect(res.data?.reviewSummariesByUser.map((r) => r.rating)).toEqual([
        10, 8.5, 6,
      ]);
    });

    it("orders by year played, most recent first", async () => {
      await seed([
        [6, 2011],
        [10, 2024],
        [8, 2018],
      ]);
      const res = await query("order: YEAR_DESC");
      expect(res.data?.reviewSummariesByUser.map((r) => r.yearPlayed)).toEqual([
        2024, 2018, 2011,
      ]);
    });

    /**
     * Postgres sorts nulls first under DESC, so without `nulls: "last"` a review
     * with no recorded year would sit above this year's — putting the "Unknown"
     * bucket at the top of the view.
     */
    it("puts reviews with no year last, not first", async () => {
      await seed([
        [7, null],
        [8, 2015],
        [9, 2022],
      ]);
      const res = await query("order: YEAR_DESC");
      expect(res.data?.reviewSummariesByUser.map((r) => r.yearPlayed)).toEqual([
        2022, 2015, null,
      ]);
    });

    it("defaults to most recently written when no order is given", async () => {
      await seed([
        [6, 2011],
        [10, 2024],
      ]);
      const res = await publicQuery<{
        reviewSummariesByUser: { rating: number }[];
      }>(
        app,
        `{ reviewSummariesByUser(userId: "${userId}") { id rating } }`
      );
      expect(res.data?.reviewSummariesByUser.map((r) => r.rating)).toEqual([10, 6]);
    });

    /** Ties must not reshuffle between requests. */
    it("breaks a score tie deterministically", async () => {
      await seed([
        [8, 2011],
        [8, 2012],
        [8, 2013],
      ]);
      const first = await query("order: RATING_DESC");
      const second = await query("order: RATING_DESC");
      expect(first.data?.reviewSummariesByUser.map((r) => r.id)).toEqual(
        second.data?.reviewSummariesByUser.map((r) => r.id)
      );
    });
  });

  describe("bounds", () => {
    it("returns a whole decade of reviews in one request", async () => {
      await seed(Array.from({ length: 120 }, (_, i) => [8, 2010 + (i % 15)]));
      const res = await query("order: YEAR_DESC");
      expect(res.data?.reviewSummariesByUser).toHaveLength(120);
    });

    /** The bound User.reviews imposes, and the reason this field exists. */
    it("returns more than the body-carrying list would", async () => {
      await seed(Array.from({ length: 120 }, (_, i) => [8, 2010 + (i % 15)]));
      const nested = await publicQuery<{ user: { reviews: unknown[] } }>(
        app,
        `{ user(id: "${userId}") { reviews { id } } }`
      );
      expect(nested.data?.user.reviews).toHaveLength(LIST_BOUNDS.nested.def);
      expect(LIST_BOUNDS.reviewSummaries.def).toBeGreaterThan(LIST_BOUNDS.nested.def);
    });

    it("clamps a caller asking past the ceiling", async () => {
      await seed(Array.from({ length: 20 }, () => [8, 2020]));
      const res = await query(`order: RECENT, limit: ${LIST_BOUNDS.reviewSummaries.max + 500}`);
      expect(res.errors).toBeUndefined();
      expect(res.data?.reviewSummariesByUser).toHaveLength(20);
    });

    it("pages with offset", async () => {
      await seed([
        [10, 2024],
        [9, 2023],
        [8, 2022],
      ]);
      const res = await query("order: RATING_DESC, limit: 2, offset: 1");
      expect(res.data?.reviewSummariesByUser.map((r) => r.rating)).toEqual([9, 8]);
    });
  });

  describe("cost", () => {
    /**
     * The whole point: 500 summaries must stay small where 500 bodies would not.
     * Measured rather than asserted in the abstract.
     */
    it("stays small at the ceiling where full reviews would not", async () => {
      await seed(Array.from({ length: 100 }, (_, i) => [8, 2010 + (i % 10)]));
      await prisma.review.updateMany({ data: { content: "x".repeat(REVIEW_CONTENT_MAX) } });

      const summaries = await query(
        "order: YEAR_DESC",
        "id rating yearPlayed hoursPlayed commentCount game { id title }"
      );
      const bytes = Buffer.byteLength(JSON.stringify(summaries.data));
      expect(summaries.errors).toBeUndefined();
      // 100 full bodies would be 2 MB; the same rows without them are far less.
      expect(bytes).toBeLessThan(100_000);
    });

    it("resolves game and commentCount without a query per row", async () => {
      await seed(Array.from({ length: 50 }, () => [8, 2020]));
      const res = await query("order: RECENT", "id commentCount game { id title }");
      expect(res.errors).toBeUndefined();
      expect(res.data?.reviewSummariesByUser).toHaveLength(50);
      expect(res.data?.reviewSummariesByUser[0].game).toMatchObject({
        title: expect.any(String),
      });
    });
  });

  it("returns nothing for a user with no reviews", async () => {
    const user = await prisma.user.create({
      data: { authentikUid: "ak-empty", username: "empty" },
    });
    const res = await authedQuery<{ reviewSummariesByUser: unknown[] }>(
      app,
      `{ reviewSummariesByUser(userId: "${user.id}") { id } }`
    );
    expect(res.data?.reviewSummariesByUser).toEqual([]);
  });
});
