import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import { validateSecondaryGenres } from "../src/lib/labels.js";
import {
  ALICE,
  BOB,
  authedQuery,
  publicQuery,
  resetDatabase,
  startApp,
} from "./helpers.js";

const CREATE = `mutation Create($input: CreateReviewInput!) {
  createReview(input: $input) { id genre secondaryGenres }
}`;

const UPDATE = `mutation Update($id: ID!, $input: UpdateReviewInput!) {
  updateReview(id: $id, input: $input) { id genre secondaryGenres }
}`;

interface ReviewPayload {
  id: string;
  genre: string | null;
  secondaryGenres: string[];
}

async function seedGame(title = "Alan Wake"): Promise<string> {
  const game = await prisma.game.create({
    data: { title, slug: slugify(title, "game") },
  });
  return game.id;
}

describe("the secondary genres a reviewer adds to a review", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  async function create(input: Record<string, unknown>) {
    return authedQuery<{ createReview: ReviewPayload }>(
      app,
      CREATE,
      ALICE,
      {},
      {
        input: {
          gameId: await seedGame(),
          rating: 8,
          content: "Played it.",
          yearPlayed: 2024,
          hoursPlayed: 12,
          ...input,
        },
      },
    );
  }

  async function review(
    genre: string | null,
    secondaryGenres: string[],
  ): Promise<ReviewPayload> {
    const res = await create({ genre, secondaryGenres });
    expect(res.errors).toBeUndefined();
    return res.data!.createReview;
  }

  async function update(id: string, input: Record<string, unknown>) {
    return authedQuery<{ updateReview: ReviewPayload }>(
      app,
      UPDATE,
      ALICE,
      {},
      { id, input },
    );
  }

  describe("writing them", () => {
    it("stores them in the order given", async () => {
      expect(
        (await review("Action", ["Horror", "Story-driven"])).secondaryGenres,
      ).toEqual(["Horror", "Story-driven"]);
    });

    it("is empty when none were given", async () => {
      const res = await create({ genre: "Action" });
      expect(res.data?.createReview.secondaryGenres).toEqual([]);
    });

    it("drops one that repeats the genre, ignoring case", async () => {
      expect(
        (await review("Horror", ["horror", "Shooter"])).secondaryGenres,
      ).toEqual(["Shooter"]);
    });

    it("keeps the first spelling of a repeat", async () => {
      expect(
        (await review(null, ["Open World", "open world", " Open  World "]))
          .secondaryGenres,
      ).toEqual(["Open World"]);
    });

    it("keeps five and drops the rest", async () => {
      expect(
        (await review(null, ["a", "b", "c", "d", "e", "f"])).secondaryGenres,
      ).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("refuses control characters", async () => {
      const res = await create({ secondaryGenres: ["RPG\u001b[31m"] });
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    });
  });

  describe("changing them", () => {
    it("replaces them on edit", async () => {
      const { id } = await review("Action", ["Horror"]);
      const res = await update(id, { secondaryGenres: ["Shooter"] });
      expect(res.data?.updateReview.secondaryGenres).toEqual(["Shooter"]);
    });

    it("leaves them alone when the input omits them", async () => {
      const { id } = await review("Action", ["Horror"]);
      const res = await update(id, { rating: 9 });
      expect(res.data?.updateReview.secondaryGenres).toEqual(["Horror"]);
    });

    it("clears them on an empty list", async () => {
      const { id } = await review("Action", ["Horror"]);
      const res = await update(id, { secondaryGenres: [] });
      expect(res.data?.updateReview.secondaryGenres).toEqual([]);
    });

    it("drops one the new genre now repeats", async () => {
      const { id } = await review("Action", ["Horror", "Shooter"]);
      const res = await update(id, { genre: "Horror" });
      expect(res.data?.updateReview).toMatchObject({
        genre: "Horror",
        secondaryGenres: ["Shooter"],
      });
    });

    it("checks new ones against the stored genre", async () => {
      const { id } = await review("Horror", []);
      const res = await update(id, { secondaryGenres: ["HORROR", "Shooter"] });
      expect(res.data?.updateReview.secondaryGenres).toEqual(["Shooter"]);
    });

    it("refuses another reviewer's edit", async () => {
      const { id } = await review("Action", ["Horror"]);
      const res = await authedQuery(
        app,
        UPDATE,
        BOB,
        {},
        { id, input: { secondaryGenres: [] } },
      );
      expect(res.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    });
  });

  it("reads back on the profile's review summaries", async () => {
    await review("Action", ["Horror"]);
    const res = await publicQuery<{
      reviewSummariesByUser: { secondaryGenres: string[] }[];
    }>(app, `{ reviewSummariesByUser(userId: "alice") { secondaryGenres } }`);
    expect(res.errors).toBeUndefined();
    expect(res.data?.reviewSummariesByUser[0]?.secondaryGenres).toEqual([
      "Horror",
    ]);
  });
});

describe("validateSecondaryGenres", () => {
  it("holds each to the genre's one-line rule", () => {
    expect(validateSecondaryGenres(["Story\ndriven"], null)).toEqual([
      "Story driven",
    ]);
  });

  it("skips blanks without counting them towards the five", () => {
    expect(
      validateSecondaryGenres(["", " ", "a", "b", "c", "d", "e"], null),
    ).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("refuses one past the label length", () => {
    expect(() => validateSecondaryGenres(["x".repeat(101)], null)).toThrow(
      /at most 100/,
    );
  });
});
