import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import {
  ALICE,
  BOB,
  authedQuery,
  resetDatabase,
  seedGame,
  startApp,
} from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { HOURS_PLAYED_MAX, YEAR_PLAYED_MIN } from "../src/resolvers/review.js";

/**
 * When a game was played, and for how long.
 *
 * `yearPlayed` is not the year the review was written: a backlog imported in one
 * sitting would otherwise read as though fifty games were all played in 2026.
 * Both columns are nullable but both are required on `CreateReviewInput`, which is
 * the asymmetry these tests exist to pin — a review written through the app always
 * carries them, while the row that predates the columns does not have to.
 */
describe("review playtime", () => {
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
    gameId = await seedGame("Played Game");
  });

  const create = (fields: string) =>
    authedQuery(
      app,
      `mutation { createReview(input: { gameId: "${gameId}", rating: 8, content: "c", ${fields} }) { id yearPlayed hoursPlayed } }`,
      ALICE
    );

  const thisYear = new Date().getFullYear();

  describe("required at creation", () => {
    it("stores both when given", async () => {
      const res = await create("yearPlayed: 2014, hoursPlayed: 47.5");
      expect(res.errors).toBeUndefined();
      expect(res.data?.createReview).toMatchObject({
        yearPlayed: 2014,
        hoursPlayed: 47.5,
      });
    });

    it("refuses a review with no yearPlayed", async () => {
      const res = await authedQuery(
        app,
        `mutation { createReview(input: { gameId: "${gameId}", rating: 8, content: "c", hoursPlayed: 12 }) { id } }`,
        ALICE
      );
      expect(res.errors?.[0]?.message).toContain("yearPlayed");
      expect(await prisma.review.count()).toBe(0);
    });

    it("refuses a review with no hoursPlayed", async () => {
      const res = await authedQuery(
        app,
        `mutation { createReview(input: { gameId: "${gameId}", rating: 8, content: "c", yearPlayed: 2014 }) { id } }`,
        ALICE
      );
      expect(res.errors?.[0]?.message).toContain("hoursPlayed");
      expect(await prisma.review.count()).toBe(0);
    });
  });

  describe("yearPlayed bounds", () => {
    it("accepts a year from a decade ago, which is the point of the field", async () => {
      const res = await create("yearPlayed: 2011, hoursPlayed: 30");
      expect(res.errors).toBeUndefined();
    });

    it("accepts next year, for a game finished in December", async () => {
      const res = await create(`yearPlayed: ${thisYear + 1}, hoursPlayed: 30`);
      expect(res.errors).toBeUndefined();
    });

    it("refuses a year beyond next", async () => {
      const res = await create(`yearPlayed: ${thisYear + 2}, hoursPlayed: 30`);
      expect(res.errors?.[0]?.message).toContain("whole year between");
    });

    it("refuses a year before the floor", async () => {
      const res = await create(`yearPlayed: ${YEAR_PLAYED_MIN - 1}, hoursPlayed: 30`);
      expect(res.errors?.[0]?.message).toContain("whole year between");
    });

    /** A mistyped four-digit year is the failure this catches. */
    it("refuses an obviously mistyped year", async () => {
      const res = await create("yearPlayed: 20144, hoursPlayed: 30");
      expect(res.errors?.[0]?.message).toContain("whole year between");
    });
  });

  describe("hoursPlayed bounds", () => {
    it("accepts a fractional hour count", async () => {
      const res = await create("yearPlayed: 2020, hoursPlayed: 1.25");
      expect((res.data?.createReview as { hoursPlayed: number }).hoursPlayed).toBe(1.3);
    });

    it("keeps one decimal as given", async () => {
      const res = await create("yearPlayed: 2020, hoursPlayed: 12.5");
      expect((res.data?.createReview as { hoursPlayed: number }).hoursPlayed).toBe(12.5);
    });

    it("refuses zero, which would mean unplayed", async () => {
      const res = await create("yearPlayed: 2020, hoursPlayed: 0");
      expect(res.errors?.[0]?.message).toContain("greater than 0");
    });

    it("refuses a negative count", async () => {
      const res = await create("yearPlayed: 2020, hoursPlayed: -5");
      expect(res.errors?.[0]?.message).toContain("greater than 0");
    });

    it("refuses an implausible count", async () => {
      const res = await create(
        `yearPlayed: 2020, hoursPlayed: ${HOURS_PLAYED_MAX + 1}`
      );
      expect(res.errors?.[0]?.message).toContain(`at most ${HOURS_PLAYED_MAX}`);
    });
  });

  describe("editable afterwards", () => {
    const createOne = async () => {
      const res = await create("yearPlayed: 2020, hoursPlayed: 10");
      return (res.data?.createReview as { id: string }).id;
    };

    it("changes the year without touching anything else", async () => {
      const id = await createOne();
      const res = await authedQuery(
        app,
        `mutation { updateReview(id: "${id}", input: { yearPlayed: 2013 }) { yearPlayed hoursPlayed rating } }`,
        ALICE
      );
      expect(res.data?.updateReview).toMatchObject({
        yearPlayed: 2013,
        hoursPlayed: 10,
        rating: 8,
      });
    });

    it("changes the hours", async () => {
      const id = await createOne();
      const res = await authedQuery(
        app,
        `mutation { updateReview(id: "${id}", input: { hoursPlayed: 62.5 }) { hoursPlayed } }`,
        ALICE
      );
      expect(res.data?.updateReview).toMatchObject({ hoursPlayed: 62.5 });
    });

    it("applies the same bounds to an edit", async () => {
      const id = await createOne();
      const res = await authedQuery(
        app,
        `mutation { updateReview(id: "${id}", input: { yearPlayed: 1800 }) { yearPlayed } }`,
        ALICE
      );
      expect(res.errors?.[0]?.message).toContain("whole year between");
    });

    it("still refuses someone else's review", async () => {
      const id = await createOne();
      const res = await authedQuery(
        app,
        `mutation { updateReview(id: "${id}", input: { yearPlayed: 2013 }) { yearPlayed } }`,
        BOB
      );
      expect(res.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    });
  });

  /**
   * The migration backfills `yearPlayed` from `createdAt` so the by-year view does
   * not open on an "Unknown" bucket holding the site's whole history. A row written
   * straight through Prisma stands in for one that predates the column.
   */
  describe("rows predating the columns", () => {
    it("reads back as null rather than failing", async () => {
      const user = await prisma.user.create({
        data: { authentikUid: "ak-old", username: "old", slug: "old" },
      });
      const review = await prisma.review.create({
        data: {
          slug: "legacy-review-unset",
          userId: user.id,
          gameId,
          rating: 7,
          content: "From before",
        },
      });

      const res = await authedQuery(
        app,
        `{ review(id: "${review.id}") { yearPlayed hoursPlayed } }`
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.review).toMatchObject({ yearPlayed: null, hoursPlayed: null });
    });

    it("can be corrected by its author afterwards", async () => {
      const user = await prisma.user.create({
        data: { authentikUid: ALICE.uid, username: ALICE.username, slug: ALICE.username },
      });
      const review = await prisma.review.create({
        data: {
          slug: "legacy-review-corrected",
          userId: user.id,
          gameId,
          rating: 7,
          content: "From before",
        },
      });

      const res = await authedQuery(
        app,
        `mutation { updateReview(id: "${review.id}", input: { yearPlayed: 2015, hoursPlayed: 8 }) { yearPlayed hoursPlayed } }`,
        ALICE
      );
      expect(res.data?.updateReview).toMatchObject({
        yearPlayed: 2015,
        hoursPlayed: 8,
      });
    });
  });
});
