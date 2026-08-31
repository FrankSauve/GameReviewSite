import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import { PLATFORMS, validatePlatform } from "../src/lib/platforms.js";
import {
  ALICE,
  BOB,
  authedQuery,
  publicQuery,
  resetDatabase,
  startApp,
} from "./helpers.js";

const CREATE = `mutation Create($input: CreateReviewInput!) {
  createReview(input: $input) { id platform }
}`;

const UPDATE = `mutation Update($id: ID!, $input: UpdateReviewInput!) {
  updateReview(id: $id, input: $input) { id platform }
}`;

interface ReviewPayload {
  id: string;
  platform: string | null;
}

async function seedGame(title = "Hades"): Promise<string> {
  const game = await prisma.game.create({
    data: { title, slug: slugify(title, "game") },
  });
  return game.id;
}

function createInput(gameId: string, platform?: string | null) {
  return {
    gameId,
    rating: 8,
    content: "Played it.",
    yearPlayed: 2024,
    hoursPlayed: 12,
    ...(platform === undefined ? {} : { platform }),
  };
}

describe("the platform a review was played on", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  describe("writing one", () => {
    it("stores the platform the reviewer selected", async () => {
      const gameId = await seedGame();
      const res = await authedQuery<{ createReview: ReviewPayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: createInput(gameId, "Nintendo Switch") },
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.createReview.platform).toBe("Nintendo Switch");
    });

    it("leaves it null when none was selected", async () => {
      const gameId = await seedGame();
      const res = await authedQuery<{ createReview: ReviewPayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: createInput(gameId) },
      );
      expect(res.data?.createReview.platform).toBeNull();
    });

    it("treats the dropdown's empty selection as none", async () => {
      const gameId = await seedGame();
      const res = await authedQuery<{ createReview: ReviewPayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: createInput(gameId, "") },
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.createReview.platform).toBeNull();
    });

    it("refuses a value the dropdown does not offer", async () => {
      const gameId = await seedGame();
      const res = await authedQuery(
        app,
        CREATE,
        ALICE,
        {},
        { input: createInput(gameId, "Sega Dreamcast") },
      );
      expect(res.errors?.[0]?.message).toBe(
        "platform must be one of the platforms offered.",
      );
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    });

    /**
     * The backfill matched RAWG's spellings case-insensitively, so a stored
     * "MacOS" has to round-trip through the form as the offered "macOS" rather
     * than being refused on save.
     */
    it("stores the offered spelling of a differently-cased value", async () => {
      const gameId = await seedGame();
      const res = await authedQuery<{ createReview: ReviewPayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: createInput(gameId, "MACOS") },
      );
      expect(res.data?.createReview.platform).toBe("macOS");
    });
  });

  describe("changing one", () => {
    async function existingReview(platform: string | null): Promise<string> {
      const gameId = await seedGame();
      const res = await authedQuery<{ createReview: ReviewPayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: createInput(gameId, platform) },
      );
      return res.data!.createReview.id;
    }

    it("replaces the platform on edit", async () => {
      const id = await existingReview("PC");
      const res = await authedQuery<{ updateReview: ReviewPayload }>(
        app,
        UPDATE,
        ALICE,
        {},
        { id, input: { platform: "PlayStation 5" } },
      );
      expect(res.data?.updateReview.platform).toBe("PlayStation 5");
    });

    it("leaves it alone when the input omits it", async () => {
      const id = await existingReview("PC");
      const res = await authedQuery<{ updateReview: ReviewPayload }>(
        app,
        UPDATE,
        ALICE,
        {},
        { id, input: { rating: 9 } },
      );
      expect(res.data?.updateReview.platform).toBe("PC");
    });

    it("clears it on an explicit null", async () => {
      const id = await existingReview("PC");
      const res = await authedQuery<{ updateReview: ReviewPayload }>(
        app,
        UPDATE,
        ALICE,
        {},
        { id, input: { platform: null } },
      );
      expect(res.data?.updateReview.platform).toBeNull();
    });

    it("refuses an unknown value rather than storing it", async () => {
      const id = await existingReview("PC");
      const res = await authedQuery(
        app,
        UPDATE,
        ALICE,
        {},
        { id, input: { platform: "Ouya" } },
      );
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
      const stored = await prisma.review.findUniqueOrThrow({ where: { id } });
      expect(stored.platform).toBe("PC");
    });
  });

  it("reads back on the public review query", async () => {
    const gameId = await seedGame();
    await authedQuery(
      app,
      CREATE,
      BOB,
      {},
      { input: createInput(gameId, "Xbox Series S/X") },
    );
    const res = await publicQuery<{
      recentReviews: { platform: string | null }[];
    }>(app, `{ recentReviews(limit: 5) { platform } }`);
    expect(res.errors).toBeUndefined();
    expect(res.data?.recentReviews[0]?.platform).toBe("Xbox Series S/X");
  });
});

describe("the offered list", () => {
  it("has no duplicate entries, case-insensitively", () => {
    const keys = PLATFORMS.map((name) => name.toLowerCase());
    expect(new Set(keys).size).toBe(PLATFORMS.length);
  });

  it("accepts every value it offers", () => {
    for (const name of PLATFORMS) expect(validatePlatform(name)).toBe(name);
  });

  /**
   * The names the migration backfills from. RAWG spells these exactly this way,
   * and a mismatch here is a review whose stored platform the dropdown cannot
   * offer.
   */
  it("covers the platforms RAWG names most often", () => {
    for (const name of [
      "PC",
      "PlayStation 5",
      "PlayStation 4",
      "Xbox Series S/X",
      "Xbox One",
      "Nintendo Switch",
      "macOS",
      "Linux",
      "iOS",
      "Android",
    ]) {
      expect(PLATFORMS).toContain(name);
    }
  });
});
