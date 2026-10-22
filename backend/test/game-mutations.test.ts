import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import {
  ALICE,
  BOB,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  startApp,
  type Identity,
} from "./helpers.js";
import { provisionUser } from "../src/lib/identity.js";
import { slugify } from "../src/lib/slug.js";

interface GamePayload {
  id: string;
  title: string;
  description?: string | null;
}

async function addGameAs(identity: Identity, title: string): Promise<string> {
  const owner = await provisionUser(identity);
  const game = await prisma.game.create({
    data: { title, slug: slugify(title, "game"), createdById: owner.id },
  });
  return game.id;
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
      const id = await addGameAs(ALICE, "Alice's Game");
      const res = await authedQuery<{ updateGame: GamePayload }>(
        app,
        `mutation { updateGame(id: "${id}", input: { title: "Corrected" }) { id title } }`,
        ALICE,
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
      const id = await addGameAs(ALICE, "Alice's Game");
      const res = await authedQuery(
        app,
        `mutation { updateGame(id: "${id}", input: { title: "VANDALISED", description: "pwned" }) { id title } }`,
        BOB,
      );
      expect(errorCodes(res)).toContain("FORBIDDEN");

      const unchanged = await prisma.game.findUnique({ where: { id } });
      expect(unchanged?.title).toBe("Alice's Game");
      expect(unchanged?.description).toBeNull();
    });

    it("refuses anonymous edits", async () => {
      const id = await addGameAs(ALICE, "Alice's Game");
      const res = await publicQuery(
        app,
        `mutation { updateGame(id: "${id}", input: { title: "VANDALISED" }) { id } }`,
      );
      expect(errorCodes(res)).toContain("UNAUTHENTICATED");
    });

    it("treats a game with no recorded creator as editable by nobody", async () => {
      // A row as it would exist from before the creator column.
      const legacy = await prisma.game.create({
        data: { title: "Legacy Game", slug: "legacy-game" },
      });
      const res = await authedQuery(
        app,
        `mutation { updateGame(id: "${legacy.id}", input: { title: "Taken over" }) { id } }`,
        ALICE,
      );
      expect(errorCodes(res)).toContain("FORBIDDEN");
    });
  });
});
