import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { provisionUser } from "../src/lib/identity.js";
import {
  ALICE,
  BOB,
  authedQuery,
  resetDatabase,
  startApp,
  type Identity,
} from "./helpers.js";

/** A game exists only while it has a review, so the last one takes it along. */

async function reviewAs(identity: Identity, gameId: string): Promise<string> {
  const user = await provisionUser(identity);
  const review = await prisma.review.create({
    data: {
      slug: `${user.slug}/${gameId}`,
      userId: user.id,
      gameId,
      rating: 8,
      content: "Played it.",
    },
  });
  return review.id;
}

async function seedGame(title: string): Promise<string> {
  const game = await prisma.game.create({
    data: { title, slug: title.toLowerCase() },
  });
  return game.id;
}

const gameExists = async (id: string) =>
  (await prisma.game.count({ where: { id } })) === 1;

describe("a game's last review", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  const deleteReview = (identity: Identity, id: string) =>
    authedQuery(app, `mutation { deleteReview(id: "${id}") }`, identity);

  it("takes the game with it when deleted", async () => {
    const game = await seedGame("Hades");
    const review = await reviewAs(ALICE, game);

    const res = await deleteReview(ALICE, review);
    expect(res.errors).toBeUndefined();
    expect(await gameExists(game)).toBe(false);
  });

  it("leaves the game while someone else's review remains", async () => {
    const game = await seedGame("Hades");
    const byAlice = await reviewAs(ALICE, game);
    await reviewAs(BOB, game);

    await deleteReview(ALICE, byAlice);
    expect(await gameExists(game)).toBe(true);
  });

  it("goes with an account that held it", async () => {
    const onlyAlice = await seedGame("Hades");
    const shared = await seedGame("Celeste");
    await reviewAs(ALICE, onlyAlice);
    await reviewAs(ALICE, shared);
    await reviewAs(BOB, shared);

    const res = await authedQuery(app, "mutation { deleteUser }", ALICE);
    expect(res.errors).toBeUndefined();
    expect(await gameExists(onlyAlice)).toBe(false);
    expect(await gameExists(shared)).toBe(true);
  });

  it("leaves games the departing account never reviewed", async () => {
    const untouched = await seedGame("Celeste");
    await reviewAs(BOB, untouched);
    await authedQuery(app, "mutation { deleteUser }", ALICE);
    expect(await gameExists(untouched)).toBe(true);
  });
});
