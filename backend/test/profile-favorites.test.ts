import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { FAVORITE_CATEGORIES } from "../src/lib/favoriteCategories.js";
import {
  ALICE,
  BOB,
  PLAYTIME_INPUT,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  seedGame,
  startApp,
  type Identity,
} from "./helpers.js";

interface FavoritePayload {
  id: string;
  category: string;
  game: { id: string; title: string };
}
interface UserPayload {
  id: string;
  favorites: FavoritePayload[];
}

const FAVORITES = `{ id favorites { id category game { id title } } }`;

const SET = `mutation Set($input: SetFavoriteGameInput!) {
  setFavoriteGame(input: $input) ${FAVORITES}
}`;
const CLEAR = `mutation Clear($category: String!) {
  clearFavoriteGame(category: $category) ${FAVORITES}
}`;

/** A game the identity has reviewed, which is the only kind that can be picked. */
async function reviewedGame(
  app: Express,
  identity: Identity,
  title: string,
): Promise<string> {
  const gameId = await seedGame(title);
  const res = await authedQuery(
    app,
    `mutation { createReview(input: { gameId: "${gameId}", rating: 8, content: "c", ${PLAYTIME_INPUT} }) { id } }`,
    identity,
  );
  expect(res.errors).toBeUndefined();
  return gameId;
}

function setFavorite(
  app: Express,
  identity: Identity | undefined,
  category: string,
  gameId: string,
) {
  return authedQuery<{ setFavoriteGame: UserPayload }>(
    app,
    SET,
    identity,
    {},
    { input: { category, gameId } },
  );
}

describe("profile favorites", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("stores a pick and shows it to anyone", async () => {
    const gameId = await reviewedGame(app, ALICE, "Elden Ring");
    const res = await setFavorite(app, ALICE, "favorite-game", gameId);
    expect(res.errors).toBeUndefined();
    expect(res.data?.setFavoriteGame.favorites).toEqual([
      expect.objectContaining({
        category: "favorite-game",
        game: expect.objectContaining({ title: "Elden Ring" }),
      }),
    ]);

    const seen = await publicQuery<{ user: UserPayload }>(
      app,
      `query { user(id: "${ALICE.username}") ${FAVORITES} }`,
    );
    expect(seen.data?.user.favorites[0]?.game.title).toBe("Elden Ring");
  });

  it("refuses a category outside the list", async () => {
    const gameId = await reviewedGame(app, ALICE, "Elden Ring");
    const res = await setFavorite(app, ALICE, "best-vibes", gameId);
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
  });

  /** Exact match, so two spellings can never write to one row. */
  it("refuses a category that differs only in case", async () => {
    const gameId = await reviewedGame(app, ALICE, "Elden Ring");
    const res = await setFavorite(app, ALICE, "Favorite-Game", gameId);
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
  });

  it("refuses a game the account has not reviewed", async () => {
    const gameId = await seedGame("Unplayed");
    const res = await setFavorite(app, ALICE, "favorite-game", gameId);
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
    expect(await prisma.favoriteGame.count()).toBe(0);
  });

  it("refuses an anonymous write", async () => {
    const gameId = await reviewedGame(app, ALICE, "Elden Ring");
    const res = await setFavorite(app, undefined, "favorite-game", gameId);
    expect(errorCodes(res)).toContain("UNAUTHENTICATED");
  });

  /**
   * The mutation takes no subject, so this is unrepresentable rather than
   * refused. Pinned so that stays true if an id argument is ever added.
   */
  it("cannot touch another account's picks", async () => {
    const alices = await reviewedGame(app, ALICE, "Elden Ring");
    const bobs = await reviewedGame(app, BOB, "Hades");
    await setFavorite(app, ALICE, "favorite-game", alices);
    await setFavorite(app, BOB, "favorite-game", bobs);

    const seen = await publicQuery<{ user: UserPayload }>(
      app,
      `query { user(id: "${ALICE.username}") ${FAVORITES} }`,
    );
    expect(seen.data?.user.favorites[0]?.game.title).toBe("Elden Ring");
    expect(await prisma.favoriteGame.count()).toBe(2);
  });

  it("replaces the pick when a category is chosen again", async () => {
    const first = await reviewedGame(app, ALICE, "Elden Ring");
    const second = await reviewedGame(app, ALICE, "Hades");
    await setFavorite(app, ALICE, "favorite-game", first);
    const res = await setFavorite(app, ALICE, "favorite-game", second);

    expect(res.data?.setFavoriteGame.favorites).toHaveLength(1);
    expect(res.data?.setFavoriteGame.favorites[0]?.game.title).toBe("Hades");
    expect(await prisma.favoriteGame.count()).toBe(1);
  });

  it("returns the picks in the order the grid draws them", async () => {
    const a = await reviewedGame(app, ALICE, "Elden Ring");
    const b = await reviewedGame(app, ALICE, "Hades");
    await setFavorite(app, ALICE, "worst-game", a);
    const res = await setFavorite(app, ALICE, "favorite-game", b);
    expect(res.data?.setFavoriteGame.favorites.map((f) => f.category)).toEqual([
      "favorite-game",
      "worst-game",
    ]);
  });

  it("clears a category, and clearing an empty one is not an error", async () => {
    const gameId = await reviewedGame(app, ALICE, "Elden Ring");
    await setFavorite(app, ALICE, "favorite-game", gameId);

    const cleared = await authedQuery<{ clearFavoriteGame: UserPayload }>(
      app,
      CLEAR,
      ALICE,
      {},
      { category: "favorite-game" },
    );
    expect(cleared.errors).toBeUndefined();
    expect(cleared.data?.clearFavoriteGame.favorites).toEqual([]);

    const again = await authedQuery<{ clearFavoriteGame: UserPayload }>(
      app,
      CLEAR,
      ALICE,
      {},
      { category: "favorite-game" },
    );
    expect(again.errors).toBeUndefined();
  });

  it("empties the tile when the game is deleted", async () => {
    const gameId = await reviewedGame(app, ALICE, "Elden Ring");
    await setFavorite(app, ALICE, "favorite-game", gameId);
    await prisma.game.delete({ where: { id: gameId } });
    expect(await prisma.favoriteGame.count()).toBe(0);
  });

  /**
   * The reviewed-it rule is checked on the write and never again: retracting a
   * review must not silently drop the pick.
   */
  it("keeps the pick when the review is deleted", async () => {
    const gameId = await reviewedGame(app, ALICE, "Elden Ring");
    await setFavorite(app, ALICE, "favorite-game", gameId);
    await prisma.review.deleteMany({ where: { gameId } });

    const seen = await publicQuery<{ user: UserPayload }>(
      app,
      `query { user(id: "${ALICE.username}") ${FAVORITES} }`,
    );
    expect(seen.data?.user.favorites).toHaveLength(1);
  });

  it("offers a category list the grid can lay out", () => {
    expect(FAVORITE_CATEGORIES.length).toBe(20);
    expect(new Set(FAVORITE_CATEGORIES).size).toBe(20);
  });
});
