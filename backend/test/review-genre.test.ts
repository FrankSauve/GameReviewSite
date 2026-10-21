import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import { validateGenre } from "../src/lib/labels.js";
import {
  ALICE,
  BOB,
  authedQuery,
  publicQuery,
  resetDatabase,
  startApp,
  type Identity,
} from "./helpers.js";

const CREATE = `mutation Create($input: CreateReviewInput!) {
  createReview(input: $input) { id genre }
}`;

const UPDATE = `mutation Update($id: ID!, $input: UpdateReviewInput!) {
  updateReview(id: $id, input: $input) { id genre }
}`;

interface ReviewPayload {
  id: string;
  genre: string | null;
}

async function seedGame(title = "Hades"): Promise<string> {
  const game = await prisma.game.create({
    data: { title, slug: slugify(title, "game") },
  });
  return game.id;
}

function createInput(gameId: string, genre?: string | null) {
  return {
    gameId,
    rating: 8,
    content: "Played it.",
    yearPlayed: 2024,
    hoursPlayed: 12,
    ...(genre === undefined ? {} : { genre }),
  };
}

describe("the genre a reviewer files a review under", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  async function review(
    identity: Identity,
    title: string,
    genre?: string | null,
  ): Promise<ReviewPayload> {
    const res = await authedQuery<{ createReview: ReviewPayload }>(
      app,
      CREATE,
      identity,
      {},
      { input: createInput(await seedGame(title), genre) },
    );
    expect(res.errors).toBeUndefined();
    return res.data!.createReview;
  }

  describe("writing one", () => {
    it("stores it trimmed", async () => {
      expect((await review(ALICE, "Hades", "  Roguelike ")).genre).toBe(
        "Roguelike",
      );
    });

    it("leaves it null when none was given", async () => {
      expect((await review(ALICE, "Hades")).genre).toBeNull();
    });

    it("treats a blank field as none", async () => {
      expect((await review(ALICE, "Hades", "   ")).genre).toBeNull();
    });

    /** The export and the Discord card print it on one line; a newline would forge another. */
    it("stores a multi-line one as a single line", async () => {
      expect(
        (await review(ALICE, "Hades", "Rogue\n# Injected\r\n\tlike")).genre,
      ).toBe("Rogue # Injected like");
    });

    it("refuses control characters", async () => {
      const res = await authedQuery(
        app,
        CREATE,
        ALICE,
        {},
        { input: createInput(await seedGame(), "RPG\u001b[31m") },
      );
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    });

    it("refuses one past the label length", async () => {
      const res = await authedQuery(
        app,
        CREATE,
        ALICE,
        {},
        { input: createInput(await seedGame(), "x".repeat(101)) },
      );
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    });
  });

  describe("changing one", () => {
    it("replaces it on edit", async () => {
      const { id } = await review(ALICE, "Hollow Knight", "Action");
      const res = await authedQuery<{ updateReview: ReviewPayload }>(
        app,
        UPDATE,
        ALICE,
        {},
        { id, input: { genre: "Metroidvania" } },
      );
      expect(res.data?.updateReview.genre).toBe("Metroidvania");
    });

    it("leaves it alone when the input omits it", async () => {
      const { id } = await review(ALICE, "Hades", "Roguelike");
      const res = await authedQuery<{ updateReview: ReviewPayload }>(
        app,
        UPDATE,
        ALICE,
        {},
        { id, input: { rating: 9 } },
      );
      expect(res.data?.updateReview.genre).toBe("Roguelike");
    });

    it("clears it on an explicit null or a blank field", async () => {
      for (const genre of [null, ""]) {
        await resetDatabase();
        const { id } = await review(ALICE, "Hades", "Roguelike");
        const res = await authedQuery<{ updateReview: ReviewPayload }>(
          app,
          UPDATE,
          ALICE,
          {},
          { id, input: { genre } },
        );
        expect(res.data?.updateReview.genre).toBeNull();
      }
    });
  });

  it("reads back on the profile's review summaries", async () => {
    await review(BOB, "Hades", "Roguelike");
    const res = await publicQuery<{
      reviewSummariesByUser: { genre: string | null }[];
    }>(app, `{ reviewSummariesByUser(userId: "bob") { genre } }`);
    expect(res.errors).toBeUndefined();
    expect(res.data?.reviewSummariesByUser[0]?.genre).toBe("Roguelike");
  });
});

describe("validateGenre", () => {
  it("folds every kind of line break and run of whitespace to one space", () => {
    expect(validateGenre("a\u2028b\u2029c\vd\fe  \u00a0f")).toBe("a b c d e f");
  });

  it("refuses a control character that is not whitespace", () => {
    for (const c of ["\u0000", "\u0007", "\u007f", "\u0085"])
      expect(() => validateGenre(`RPG${c}`)).toThrow(/control characters/);
  });

  it("clears a value of nothing but whitespace", () => {
    expect(validateGenre("\n\t ")).toBeNull();
  });
});
