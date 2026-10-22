import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { MAX_LABELS } from "../src/lib/labels.js";
import {
  ALICE,
  authedQuery,
  publicQuery,
  resetDatabase,
  startApp,
  type GraphQLResponse,
} from "./helpers.js";
import { provisionUser } from "../src/lib/identity.js";
import { slugify } from "../src/lib/slug.js";
import { prisma } from "../src/lib/prisma.js";

interface GamePayload {
  id: string;
  title: string;
  genres: string[];
}

/**
 * Every genre RAWG lists for Terraria.
 *
 * Longer than the cap, and joined with ", " well past the 100 characters the
 * old single `genre` column allowed — which is what made the game unaddable
 * before the lists existed. The validation was right and the shape was wrong.
 */
const TERRARIA_GENRES = [
  "Action",
  "Adventure",
  "Indie",
  "RPG",
  "Platformer",
  "Casual",
  "Massively Multiplayer",
];

const SET = `mutation Set($id: ID!, $input: UpdateGameInput!) {
  updateGame(id: $id, input: $input) { id title genres }
}`;

/** A game Alice owns, with its genres set the way her edit would set them. */
async function addGame(
  app: Express,
  input: { title: string; genres?: string[] },
): Promise<GraphQLResponse<{ updateGame: GamePayload }>> {
  const owner = await provisionUser(ALICE);
  const game = await prisma.game.create({
    data: {
      title: input.title,
      slug: slugify(input.title, "game"),
      createdById: owner.id,
    },
  });
  const genres = input.genres === undefined ? {} : { genres: input.genres };
  return authedQuery<{ updateGame: GamePayload }>(
    app,
    SET,
    ALICE,
    {},
    { id: game.id, input: genres },
  );
}

describe("genres", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  describe("the Terraria case", () => {
    it("takes a game with more genres than the cap instead of refusing it", async () => {
      const res = await addGame(app, {
        title: "Terraria",
        genres: TERRARIA_GENRES,
      });

      expect(res.errors).toBeUndefined();
      expect(res.data?.updateGame.title).toBe("Terraria");
    });

    /**
     * Dropped rather than refused. Erroring on a game for carrying too many
     * labels is exactly the failure this replaces.
     */
    it("keeps the first few genres and discards the rest", async () => {
      const res = await addGame(app, {
        title: "Terraria",
        genres: TERRARIA_GENRES,
      });

      expect(res.data?.updateGame.genres).toEqual(
        TERRARIA_GENRES.slice(0, MAX_LABELS),
      );
    });
  });

  describe("storing lists", () => {
    it("keeps several genres rather than only the first", async () => {
      const res = await addGame(app, {
        title: "Hades",
        genres: ["Action", "Roguelike", "Indie"],
      });
      expect(res.data?.updateGame.genres).toEqual([
        "Action",
        "Roguelike",
        "Indie",
      ]);
    });

    it("preserves the order it was given", async () => {
      const res = await addGame(app, {
        title: "Ordered",
        genres: ["Z", "A", "M"],
      });
      expect(res.data?.updateGame.genres).toEqual(["Z", "A", "M"]);
    });

    it("defaults to an empty list rather than null", async () => {
      const res = await addGame(app, { title: "Bare" });
      expect(res.data?.updateGame.genres).toEqual([]);
    });

    it("reads back on the public query", async () => {
      await addGame(app, { title: "Hades", genres: ["Action", "Roguelike"] });
      const res = await publicQuery<{ games: GamePayload[] }>(
        app,
        // Bounded: the static row guard refuses an unbounded `games` query,
        // which is unrelated to what this test is about.
        `{ games(limit: 5) { title genres } }`,
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.games).toHaveLength(1);
      expect(res.data?.games[0]?.genres).toEqual(["Action", "Roguelike"]);
    });
  });

  describe("cleaning", () => {
    it("drops blank entries", async () => {
      const res = await addGame(app, {
        title: "Blanks",
        genres: ["Action", "", "   ", "Indie"],
      });
      expect(res.data?.updateGame.genres).toEqual(["Action", "Indie"]);
    });

    it("trims each entry", async () => {
      const res = await addGame(app, {
        title: "Padded",
        genres: ["  Action  "],
      });
      expect(res.data?.updateGame.genres).toEqual(["Action"]);
    });

    /** RAWG writes "Indie", a hand-typed entry writes "indie". */
    it("removes case-insensitive duplicates, keeping the first spelling", async () => {
      const res = await addGame(app, {
        title: "Dupes",
        genres: ["Indie", "indie", "INDIE"],
      });
      expect(res.data?.updateGame.genres).toEqual(["Indie"]);
    });

    it("counts the cap after cleaning, not before", async () => {
      const res = await addGame(app, {
        title: "Messy",
        genres: ["A", "", "A", "B", "  ", "C", "D", "E", "F"],
      });
      expect(res.data?.updateGame.genres).toEqual(["A", "B", "C", "D", "E"]);
    });

    /** Many entries is a normal game; one enormous entry is a malformed request. */
    it("still refuses a single absurdly long entry", async () => {
      const res = await addGame(app, {
        title: "Long",
        genres: ["x".repeat(101)],
      });
      expect(res.errors?.[0]?.message).toMatch(/at most/);
    });
  });

  describe("editing", () => {
    it("replaces the list rather than merging into it", async () => {
      const created = await addGame(app, {
        title: "Editable",
        genres: ["Action", "Puzzle"],
      });
      const id = created.data!.updateGame.id;

      const res = await authedQuery<{ updateGame: GamePayload }>(
        app,
        `mutation Update($id: ID!, $input: UpdateGameInput!) {
           updateGame(id: $id, input: $input) { genres }
         }`,
        ALICE,
        {},
        { id, input: { genres: ["Strategy"] } },
      );
      expect(res.data?.updateGame.genres).toEqual(["Strategy"]);
    });

    it("leaves the lists alone when the input omits them", async () => {
      const created = await addGame(app, {
        title: "Untouched",
        genres: ["Action"],
      });
      const id = created.data!.updateGame.id;

      const res = await authedQuery<{ updateGame: GamePayload }>(
        app,
        `mutation Update($id: ID!, $input: UpdateGameInput!) {
           updateGame(id: $id, input: $input) { title genres }
         }`,
        ALICE,
        {},
        { id, input: { title: "Renamed" } },
      );
      expect(res.data?.updateGame.genres).toEqual(["Action"]);
    });
  });
});

/**
 * The column, not the resolvers.
 *
 * `String[]` in schema.prisma is non-nullable, but the column was created
 * nullable with no default and Prisma coerced the NULL to [] on read — so the
 * app could not see the divergence and every other reader could. These assert
 * the database itself, because that is where the disagreement lived.
 */
describe("the genres column", () => {
  beforeEach(resetDatabase);

  it("refuses a NULL, which the schema has always claimed it did", async () => {
    await expect(
      prisma.$executeRawUnsafe(`
        INSERT INTO "Game" (id, slug, title, genres, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), 'null-labels', 'Null Labels', NULL, now(), now())
      `),
    ).rejects.toThrow();
  });

  it("defaults an omitted column to the empty array", async () => {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Game" (id, slug, title, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), 'omitted', 'Omitted', now(), now())
    `);

    const [row] = await prisma.$queryRawUnsafe<{ genres_is_null: boolean }[]>(
      `SELECT genres IS NULL AS genres_is_null FROM "Game" WHERE slug = 'omitted'`,
    );

    // Not just "Prisma reports []" — that was true before, and was the problem.
    expect(row?.genres_is_null).toBe(false);
  });
});
