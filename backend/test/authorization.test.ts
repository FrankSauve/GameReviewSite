import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import {
  ALICE,
  BOB,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  seedGame,
  startApp,
} from "./helpers";

/**
 * Regression tests for the authorization holes the initial version shipped
 * with: three game mutations reachable without a token, one of which
 * cascade-deleted reviews.
 */
describe("authorization", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  describe("game mutations require authentication", () => {
    it("rejects anonymous createGame", async () => {
      const res = await authedQuery(
        app,
        'mutation { createGame(input: { title: "Anon" }) { id } }'
      );
      expect(errorCodes(res)).toContain("UNAUTHENTICATED");
    });

    it("rejects anonymous updateGame", async () => {
      const gameId = await seedGame();
      const res = await authedQuery(
        app,
        `mutation { updateGame(id: "${gameId}", input: { title: "Hijacked" }) { id } }`
      );
      expect(errorCodes(res)).toContain("UNAUTHENTICATED");
    });

    it("allows createGame for a signed-in user", async () => {
      const res = await authedQuery<{ createGame: { title: string } }>(
        app,
        'mutation { createGame(input: { title: "Legit" }) { id title } }',
        ALICE
      );
      expect(res.data?.createGame.title).toBe("Legit");
    });
  });

  /**
   * deleteGame cascaded to Review and Comment, so an anonymous caller could
   * erase the site's content. It was removed rather than gated: nothing in the
   * frontend ever called it.
   */
  it("no longer exposes deleteGame at all", async () => {
    const res = await authedQuery(
      app,
      'mutation { deleteGame(id: "whatever") }',
      ALICE
    );
    expect(errorCodes(res)).toContain("GRAPHQL_VALIDATION_FAILED");
  });

  describe("ownership", () => {
    it("stops one user editing another's review", async () => {
      const gameId = await seedGame();
      const created = await authedQuery<{ createReview: { id: string } }>(
        app,
        `mutation { createReview(input: { gameId: "${gameId}", rating: 8, content: "Alice's take" }) { id } }`,
        ALICE
      );
      const reviewId = created.data!.createReview.id;

      const res = await authedQuery(
        app,
        `mutation { updateReview(id: "${reviewId}", input: { content: "Defaced" }) { id } }`,
        BOB
      );
      expect(errorCodes(res)).toContain("FORBIDDEN");
    });

    it("stops one user deleting another's review", async () => {
      const gameId = await seedGame();
      const created = await authedQuery<{ createReview: { id: string } }>(
        app,
        `mutation { createReview(input: { gameId: "${gameId}", rating: 7, content: "Mine" }) { id } }`,
        ALICE
      );
      const reviewId = created.data!.createReview.id;

      const res = await authedQuery(
        app,
        `mutation { deleteReview(id: "${reviewId}") }`,
        BOB
      );
      expect(errorCodes(res)).toContain("FORBIDDEN");
    });

    it("stops one user deleting another's comment", async () => {
      const gameId = await seedGame();
      const review = await authedQuery<{ createReview: { id: string } }>(
        app,
        `mutation { createReview(input: { gameId: "${gameId}", rating: 6, content: "R" }) { id } }`,
        ALICE
      );
      const reviewId = review.data!.createReview.id;
      const comment = await authedQuery<{ createComment: { id: string } }>(
        app,
        `mutation { createComment(input: { reviewId: "${reviewId}", content: "Alice comment" }) { id } }`,
        ALICE
      );
      const commentId = comment.data!.createComment.id;

      const res = await authedQuery(
        app,
        `mutation { deleteComment(id: "${commentId}") }`,
        BOB
      );
      expect(errorCodes(res)).toContain("FORBIDDEN");
    });

    it("lets a user delete their own review", async () => {
      const gameId = await seedGame();
      const created = await authedQuery<{ createReview: { id: string } }>(
        app,
        `mutation { createReview(input: { gameId: "${gameId}", rating: 9, content: "Mine" }) { id } }`,
        ALICE
      );
      const res = await authedQuery<{ deleteReview: boolean }>(
        app,
        `mutation { deleteReview(id: "${created.data!.createReview.id}") }`,
        ALICE
      );
      expect(res.data?.deleteReview).toBe(true);
    });
  });

  it("keeps reviews readable without signing in", async () => {
    const gameId = await seedGame("Public Game");
    await authedQuery(
      app,
      `mutation { createReview(input: { gameId: "${gameId}", rating: 10, content: "Visible to all" }) { id } }`,
      ALICE
    );

    const res = await publicQuery<{
      recentReviews: { content: string; user: { username: string } }[];
    }>(app, "{ recentReviews { content user { username } } }");
    expect(res.data?.recentReviews).toHaveLength(1);
    expect(res.data?.recentReviews[0]?.content).toBe("Visible to all");
    expect(res.data?.recentReviews[0]?.user.username).toBe("alice");
  });
});
