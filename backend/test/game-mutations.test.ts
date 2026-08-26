import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma";
import {
  ALICE,
  BOB,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  startApp,
} from "./helpers";

interface GamePayload {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
}

async function addGameAs(
  app: Express,
  identity: typeof ALICE,
  title: string
): Promise<string> {
  const res = await authedQuery<{ createGame: GamePayload }>(
    app,
    `mutation { createGame(input: { title: "${title}" }) { id title } }`,
    identity
  );
  expect(res.errors).toBeUndefined();
  return res.data!.createGame.id;
}

describe("game mutations", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  describe("who may edit a game", () => {
    it("lets the account that added a game edit it", async () => {
      const id = await addGameAs(app, ALICE, "Alice's Game");
      const res = await authedQuery<{ updateGame: GamePayload }>(
        app,
        `mutation { updateGame(id: "${id}", input: { title: "Corrected" }) { id title } }`,
        ALICE
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.updateGame.title).toBe("Corrected");
    });

    /**
     * Game rows are shared — everybody's reviews hang off the same entry — so a
     * title or description change rewrites the context of every review attached
     * to it. This used to succeed for any signed-in account.
     */
    it("refuses to let another account edit it", async () => {
      const id = await addGameAs(app, ALICE, "Alice's Game");
      const res = await authedQuery(
        app,
        `mutation { updateGame(id: "${id}", input: { title: "VANDALISED", description: "pwned" }) { id title } }`,
        BOB
      );
      expect(errorCodes(res)).toContain("FORBIDDEN");

      const unchanged = await prisma.game.findUnique({ where: { id } });
      expect(unchanged?.title).toBe("Alice's Game");
      expect(unchanged?.description).toBeNull();
    });

    it("refuses anonymous edits", async () => {
      const id = await addGameAs(app, ALICE, "Alice's Game");
      const res = await publicQuery(
        app,
        `mutation { updateGame(id: "${id}", input: { title: "VANDALISED" }) { id } }`
      );
      expect(errorCodes(res)).toContain("UNAUTHENTICATED");
    });

    it("treats a game with no recorded creator as editable by nobody", async () => {
      // A row as it would exist from before the creator column.
      const legacy = await prisma.game.create({ data: { title: "Legacy Game" } });
      const res = await authedQuery(
        app,
        `mutation { updateGame(id: "${legacy.id}", input: { title: "Taken over" }) { id } }`,
        ALICE
      );
      expect(errorCodes(res)).toContain("FORBIDDEN");
    });
  });

  describe("importGame input validation", () => {
    it("rejects an over-long title, exactly as createGame does", async () => {
      const long = "T".repeat(20_000);
      const imported = await authedQuery(
        app,
        `mutation Import($input: ImportGameInput!) { importGame(input: $input) { id } }`,
        ALICE,
        {},
        { input: { rawgId: "1", title: long } }
      );
      expect(imported.errors?.[0]?.message).toMatch(/at most 200 characters/);
    });

    it("rejects a coverUrl that is not https", async () => {
      for (const coverUrl of [
        "javascript:alert(document.domain)",
        "http://example.com/a.png",
        "data:image/png;base64,AAAA",
        "not a url",
      ]) {
        const res = await authedQuery(
          app,
          `mutation Import($input: ImportGameInput!) { importGame(input: $input) { id } }`,
          ALICE,
          {},
          { input: { rawgId: "1", title: "Fine", coverUrl } }
        );
        expect(res.errors?.[0]?.message, coverUrl).toMatch(
          /coverUrl must (use https|be an absolute URL)/
        );
      }
    });

    it("accepts an https coverUrl", async () => {
      const res = await authedQuery<{ importGame: GamePayload }>(
        app,
        `mutation Import($input: ImportGameInput!) { importGame(input: $input) { id coverUrl } }`,
        ALICE,
        {},
        {
          input: {
            rawgId: "1",
            title: "Fine",
            coverUrl: "https://media.rawg.io/media/games/a.jpg",
          },
        }
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.importGame.coverUrl).toBe(
        "https://media.rawg.io/media/games/a.jpg"
      );
    });

    it("rejects a rawgId that is not an integer", async () => {
      const res = await authedQuery(
        app,
        `mutation Import($input: ImportGameInput!) { importGame(input: $input) { id } }`,
        ALICE,
        {},
        { input: { rawgId: "../../etc/passwd", title: "Fine" } }
      );
      expect(res.errors?.[0]?.message).toMatch(/rawgId must be a positive integer/);
    });

    /**
     * The upsert used to rewrite `description` on every import, so re-importing a
     * game was a way to change a row somebody else owned.
     */
    it("does not overwrite an existing game's description", async () => {
      const existing = await prisma.game.create({
        data: { rawgId: "42", title: "Already Here", description: "Original" },
      });

      const res = await authedQuery<{ importGame: GamePayload }>(
        app,
        `mutation Import($input: ImportGameInput!) { importGame(input: $input) { id title description } }`,
        BOB,
        {},
        { input: { rawgId: "42", title: "Renamed By Bob" } }
      );

      expect(res.errors).toBeUndefined();
      const after = await prisma.game.findUnique({ where: { id: existing.id } });
      expect(after?.title).toBe("Already Here");
      expect(after?.description).toBe("Original");
    });

    it("records the importer as the creator", async () => {
      const res = await authedQuery<{ importGame: GamePayload }>(
        app,
        `mutation Import($input: ImportGameInput!) { importGame(input: $input) { id } }`,
        ALICE,
        {},
        { input: { rawgId: "7", title: "Imported" } }
      );
      const game = await prisma.game.findUnique({
        where: { id: res.data!.importGame.id },
        include: { createdBy: true },
      });
      expect(game?.createdBy?.username).toBe(ALICE.username);
    });
  });
});
