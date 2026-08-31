import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import {
  ALICE,
  PLAYTIME_INPUT,
  authedQuery,
  resetDatabase,
  seedGame,
  startApp,
  type GraphQLResponse,
} from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

/**
 * Scores are whole or half points on a 1–10 scale.
 *
 * The column is a `Float` and always has been, so this suite is about the
 * constraint rather than the storage. The predecessor of `validateRating` rounded
 * to one decimal and accepted 0, which meant an off-scale score was silently
 * altered rather than refused — the thing a backlog import must not do quietly.
 */
describe("rating scale", () => {
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
    gameId = await seedGame("Scored Game");
  });

  const create = (rating: string): Promise<GraphQLResponse> =>
    authedQuery(
      app,
      `mutation { createReview(input: { gameId: "${gameId}", rating: ${rating}, content: "c", ${PLAYTIME_INPUT} }) { id rating } }`,
      ALICE,
    );

  it.each(["1", "1.5", "5", "9.5", "10"])("accepts %s", async (rating) => {
    const res = await create(rating);
    expect(res.errors).toBeUndefined();
    expect((res.data?.createReview as { rating: number }).rating).toBe(
      Number(rating),
    );
  });

  it.each(["9.4", "9.1", "8.25"])("refuses %s", async (rating) => {
    const res = await create(rating);
    expect(res.errors?.[0]?.message).toContain("whole or half point");
    expect(await prisma.review.count()).toBe(0);
  });

  it.each(["0", "0.5", "11", "-3", "10.5"])(
    "refuses %s as off the scale",
    async (rating) => {
      const res = await create(rating);
      expect(res.errors?.[0]?.message).toContain("between 1 and 10");
      expect(await prisma.review.count()).toBe(0);
    },
  );

  it("stores a half point unchanged rather than rounding it", async () => {
    await create("7.5");
    const review = await prisma.review.findFirst();
    expect(review?.rating).toBe(7.5);
  });

  it("applies the same scale to an edit", async () => {
    const created = await create("8");
    const id = (created.data?.createReview as { id: string }).id;

    const bad = await authedQuery(
      app,
      `mutation { updateReview(id: "${id}", input: { rating: 8.3 }) { id rating } }`,
      ALICE,
    );
    expect(bad.errors?.[0]?.message).toContain("whole or half point");

    const good = await authedQuery(
      app,
      `mutation { updateReview(id: "${id}", input: { rating: 8.5 }) { id rating } }`,
      ALICE,
    );
    expect((good.data?.updateReview as { rating: number }).rating).toBe(8.5);
  });
});
