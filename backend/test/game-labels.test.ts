import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { MAX_LABELS } from "../src/resolvers/game.js";
import { ALICE, authedQuery, publicQuery, resetDatabase, startApp } from "./helpers.js";

interface GamePayload {
  id: string;
  title: string;
  genres: string[];
  platforms: string[];
}

/**
 * Every platform RAWG lists for Terraria.
 *
 * This is the case the issue was filed for. Joined with ", " it is well past the
 * 100 characters the old single `platform` column allowed, so importing it
 * failed outright — the validation was right and the shape was wrong.
 */
const TERRARIA_PLATFORMS = [
  "PC",
  "PlayStation 3",
  "PlayStation 4",
  "PS Vita",
  "Xbox 360",
  "Xbox One",
  "Nintendo Switch",
  "Wii U",
  "Nintendo 3DS",
  "iOS",
  "Android",
  "Linux",
  "macOS",
];

const IMPORT = `mutation Import($input: ImportGameInput!) {
  importGame(input: $input) { id title genres platforms }
}`;

const CREATE = `mutation Create($input: CreateGameInput!) {
  createGame(input: $input) { id title genres platforms }
}`;

describe("genres and platforms", () => {
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
    it("imports a game on a dozen platforms instead of refusing it", async () => {
      const res = await authedQuery<{ importGame: GamePayload }>(
        app,
        IMPORT,
        ALICE,
        {},
        {
          input: {
            rawgId: "1",
            title: "Terraria",
            genres: ["Action", "Adventure", "Indie"],
            platforms: TERRARIA_PLATFORMS,
          },
        }
      );

      expect(res.errors).toBeUndefined();
      expect(res.data?.importGame.title).toBe("Terraria");
    });

    /**
     * Dropped rather than refused. Erroring on a game for being on too many
     * platforms is exactly the failure this replaces.
     */
    it("keeps the first few platforms and discards the rest", async () => {
      const res = await authedQuery<{ importGame: GamePayload }>(
        app,
        IMPORT,
        ALICE,
        {},
        {
          input: { rawgId: "1", title: "Terraria", platforms: TERRARIA_PLATFORMS },
        }
      );

      expect(res.data?.importGame.platforms).toEqual(
        TERRARIA_PLATFORMS.slice(0, MAX_LABELS)
      );
    });
  });

  describe("storing lists", () => {
    it("keeps several genres rather than only the first", async () => {
      const res = await authedQuery<{ createGame: GamePayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Hades", genres: ["Action", "Roguelike", "Indie"] } }
      );
      expect(res.data?.createGame.genres).toEqual(["Action", "Roguelike", "Indie"]);
    });

    it("preserves the order it was given", async () => {
      const res = await authedQuery<{ createGame: GamePayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Ordered", platforms: ["Z", "A", "M"] } }
      );
      expect(res.data?.createGame.platforms).toEqual(["Z", "A", "M"]);
    });

    it("defaults to empty lists rather than null", async () => {
      const res = await authedQuery<{ createGame: GamePayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Bare" } }
      );
      expect(res.data?.createGame.genres).toEqual([]);
      expect(res.data?.createGame.platforms).toEqual([]);
    });

    it("reads back on the public query", async () => {
      await authedQuery(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Hades", platforms: ["PC", "Switch"] } }
      );
      const res = await publicQuery<{ games: GamePayload[] }>(
        app,
        // Bounded: the static row guard refuses an unbounded `games` query,
        // which is unrelated to what this test is about.
        `{ games(limit: 5) { title platforms } }`
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.games).toHaveLength(1);
      expect(res.data?.games[0].platforms).toEqual(["PC", "Switch"]);
    });
  });

  describe("cleaning", () => {
    it("drops blank entries", async () => {
      const res = await authedQuery<{ createGame: GamePayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Blanks", genres: ["Action", "", "   ", "Indie"] } }
      );
      expect(res.data?.createGame.genres).toEqual(["Action", "Indie"]);
    });

    it("trims each entry", async () => {
      const res = await authedQuery<{ createGame: GamePayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Padded", genres: ["  Action  "] } }
      );
      expect(res.data?.createGame.genres).toEqual(["Action"]);
    });

    /** RAWG is inconsistent about "macOS" and "MacOS". */
    it("removes case-insensitive duplicates, keeping the first spelling", async () => {
      const res = await authedQuery<{ createGame: GamePayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Dupes", platforms: ["macOS", "MacOS", "MACOS"] } }
      );
      expect(res.data?.createGame.platforms).toEqual(["macOS"]);
    });

    it("counts the cap after cleaning, not before", async () => {
      const res = await authedQuery<{ createGame: GamePayload }>(
        app,
        CREATE,
        ALICE,
        {},
        {
          input: {
            title: "Messy",
            platforms: ["A", "", "A", "B", "  ", "C", "D", "E", "F"],
          },
        }
      );
      expect(res.data?.createGame.platforms).toEqual(["A", "B", "C", "D", "E"]);
    });

    /** Many entries is a normal game; one enormous entry is a malformed request. */
    it("still refuses a single absurdly long entry", async () => {
      const res = await authedQuery(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Long", genres: ["x".repeat(101)] } }
      );
      expect(res.errors?.[0]?.message).toMatch(/at most/);
    });
  });

  describe("editing", () => {
    it("replaces the list rather than merging into it", async () => {
      const created = await authedQuery<{ createGame: GamePayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Editable", platforms: ["PC", "Switch"] } }
      );
      const id = created.data!.createGame.id;

      const res = await authedQuery<{ updateGame: GamePayload }>(
        app,
        `mutation Update($id: ID!, $input: UpdateGameInput!) {
           updateGame(id: $id, input: $input) { platforms }
         }`,
        ALICE,
        {},
        { id, input: { platforms: ["Linux"] } }
      );
      expect(res.data?.updateGame.platforms).toEqual(["Linux"]);
    });

    it("leaves the lists alone when the input omits them", async () => {
      const created = await authedQuery<{ createGame: GamePayload }>(
        app,
        CREATE,
        ALICE,
        {},
        { input: { title: "Untouched", platforms: ["PC"] } }
      );
      const id = created.data!.createGame.id;

      const res = await authedQuery<{ updateGame: GamePayload }>(
        app,
        `mutation Update($id: ID!, $input: UpdateGameInput!) {
           updateGame(id: $id, input: $input) { title platforms }
         }`,
        ALICE,
        {},
        { id, input: { title: "Renamed" } }
      );
      expect(res.data?.updateGame.platforms).toEqual(["PC"]);
    });
  });
});
