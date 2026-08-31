import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import { validateEmoji } from "../src/lib/emoji.js";
import {
  ALICE,
  BOB,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  seedGame,
  sessionFor,
  startApp,
  type Identity,
} from "./helpers.js";

const TOGGLE = `mutation Toggle($input: ToggleReactionInput!) {
  toggleReaction(input: $input) { emoji count reacted }
}`;

const READ_REVIEW = `query Read($id: ID!) {
  review(id: $id) {
    reactions { emoji count reacted }
    comments { id reactions { emoji count reacted } }
  }
}`;

interface Summary {
  emoji: string;
  count: number;
  reacted: boolean;
}

async function seedReview(userId: string, gameId: string): Promise<string> {
  const review = await prisma.review.create({
    data: {
      slug: slugify(`review-${userId}-${gameId}`, "review"),
      rating: 8,
      content: "Played it.",
      userId,
      gameId,
    },
  });
  return review.id;
}

async function userId(identity: Identity): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { username: identity.username },
  });
  return user.id;
}

describe("emoji reactions", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  /** A review by Alice, plus a comment on it by Bob. */
  async function seedThread(): Promise<{
    reviewId: string;
    commentId: string;
  }> {
    const gameId = await seedGame();
    await sessionFor(ALICE);
    await sessionFor(BOB);
    const reviewId = await seedReview(await userId(ALICE), gameId);
    const comment = await prisma.comment.create({
      data: { content: "Agreed.", userId: await userId(BOB), reviewId },
    });
    return { reviewId, commentId: comment.id };
  }

  describe("toggling", () => {
    it("adds the reaction and returns the parent's new summary", async () => {
      const { reviewId } = await seedThread();
      const res = await authedQuery<{ toggleReaction: Summary[] }>(
        app,
        TOGGLE,
        ALICE,
        {},
        { input: { reviewId, emoji: "👍" } },
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.toggleReaction).toEqual([
        { emoji: "👍", count: 1, reacted: true },
      ]);
    });

    it("removes it when the same person sends it again", async () => {
      const { reviewId } = await seedThread();
      const input = { input: { reviewId, emoji: "👍" } };
      await authedQuery(app, TOGGLE, ALICE, {}, input);
      const res = await authedQuery<{ toggleReaction: Summary[] }>(
        app,
        TOGGLE,
        ALICE,
        {},
        input,
      );
      expect(res.data?.toggleReaction).toEqual([]);
      expect(await prisma.reaction.count()).toBe(0);
    });

    it("counts one row per person per emoji, never two", async () => {
      const { reviewId } = await seedThread();
      const input = { input: { reviewId, emoji: "❤️" } };
      await authedQuery(app, TOGGLE, ALICE, {}, input);
      await authedQuery(app, TOGGLE, BOB, {}, input);
      const res = await authedQuery<{ toggleReaction: Summary[] }>(
        app,
        TOGGLE,
        BOB,
        {},
        { input: { reviewId, emoji: "😂" } },
      );
      expect(res.data?.toggleReaction).toEqual([
        { emoji: "❤️", count: 2, reacted: true },
        { emoji: "😂", count: 1, reacted: true },
      ]);
    });

    it("reacts to a comment without touching its review", async () => {
      const { reviewId, commentId } = await seedThread();
      await authedQuery(
        app,
        TOGGLE,
        ALICE,
        {},
        { input: { commentId, emoji: "😢" } },
      );
      const res = await authedQuery<{
        review: {
          reactions: Summary[];
          comments: { reactions: Summary[] }[];
        } | null;
      }>(app, READ_REVIEW, ALICE, {}, { id: reviewId });
      expect(res.data?.review?.reactions).toEqual([]);
      expect(res.data?.review?.comments[0]?.reactions).toEqual([
        { emoji: "😢", count: 1, reacted: true },
      ]);
    });
  });

  describe("who may react", () => {
    it("refuses an anonymous visitor", async () => {
      const { reviewId } = await seedThread();
      const res = await publicQuery(
        app,
        TOGGLE,
        {},
        { input: { reviewId, emoji: "👍" } },
      );
      expect(errorCodes(res)).toEqual(["UNAUTHENTICATED"]);
      expect(await prisma.reaction.count()).toBe(0);
    });

    it("still lets an anonymous visitor read the counts", async () => {
      const { reviewId } = await seedThread();
      await authedQuery(
        app,
        TOGGLE,
        ALICE,
        {},
        { input: { reviewId, emoji: "👍" } },
      );
      const res = await publicQuery<{
        review: { reactions: Summary[] } | null;
      }>(app, READ_REVIEW, {}, { id: reviewId });
      expect(res.data?.review?.reactions).toEqual([
        { emoji: "👍", count: 1, reacted: false },
      ]);
    });

    it("marks only the caller's own reactions as theirs", async () => {
      const { reviewId } = await seedThread();
      await authedQuery(
        app,
        TOGGLE,
        ALICE,
        {},
        { input: { reviewId, emoji: "👍" } },
      );
      const res = await authedQuery<{
        review: { reactions: Summary[] } | null;
      }>(app, READ_REVIEW, BOB, {}, { id: reviewId });
      expect(res.data?.review?.reactions).toEqual([
        { emoji: "👍", count: 1, reacted: false },
      ]);
    });
  });

  describe("what may be stored", () => {
    it("refuses text that is not an emoji", async () => {
      const { reviewId } = await seedThread();
      const res = await authedQuery(
        app,
        TOGGLE,
        ALICE,
        {},
        { input: { reviewId, emoji: "<script>alert(1)</script>" } },
      );
      expect(errorCodes(res)).toEqual(["BAD_USER_INPUT"]);
      expect(await prisma.reaction.count()).toBe(0);
    });

    it("refuses two emoji at once", () => {
      expect(() => validateEmoji("👍👎")).toThrow();
    });

    it("accepts a ZWJ sequence, a skin tone and a flag", () => {
      expect(validateEmoji("👨‍👩‍👧‍👦")).toBe("👨‍👩‍👧‍👦");
      expect(validateEmoji("👍🏽")).toBe("👍🏽");
      expect(validateEmoji("🇨🇦")).toBe("🇨🇦");
    });

    it("refuses an empty emoji and one that is too long", () => {
      expect(() => validateEmoji("")).toThrow();
      expect(() => validateEmoji("👍".repeat(100))).toThrow();
    });

    it("refuses a reaction with both parents, and one with neither", async () => {
      const { reviewId, commentId } = await seedThread();
      const both = await authedQuery(
        app,
        TOGGLE,
        ALICE,
        {},
        { input: { reviewId, commentId, emoji: "👍" } },
      );
      expect(errorCodes(both)).toEqual(["BAD_USER_INPUT"]);
      const neither = await authedQuery(
        app,
        TOGGLE,
        ALICE,
        {},
        { input: { emoji: "👍" } },
      );
      expect(errorCodes(neither)).toEqual(["BAD_USER_INPUT"]);
      expect(await prisma.reaction.count()).toBe(0);
    });

    it("refuses a parent that does not exist", async () => {
      const res = await authedQuery(
        app,
        TOGGLE,
        ALICE,
        {},
        { input: { reviewId: "no-such-review", emoji: "👍" } },
      );
      expect(errorCodes(res)).toEqual(["NOT_FOUND"]);
    });
  });

  describe("when the thing reacted to goes away", () => {
    it("deletes a comment's reactions with the comment", async () => {
      const { commentId } = await seedThread();
      await authedQuery(
        app,
        TOGGLE,
        ALICE,
        {},
        { input: { commentId, emoji: "👍" } },
      );
      await prisma.comment.delete({ where: { id: commentId } });
      expect(await prisma.reaction.count()).toBe(0);
    });

    it("deletes a person's reactions with the person", async () => {
      const { reviewId } = await seedThread();
      await authedQuery(
        app,
        TOGGLE,
        BOB,
        {},
        { input: { reviewId, emoji: "👍" } },
      );
      await prisma.user.delete({ where: { id: await userId(BOB) } });
      expect(await prisma.reaction.count()).toBe(0);
    });
  });

  describe("the query shape the review page asks for", () => {
    it("is not refused as too large", async () => {
      const { reviewId } = await seedThread();
      const res = await publicQuery(app, READ_REVIEW, {}, { id: reviewId });
      expect(errorCodes(res)).toEqual([]);
    });
  });
});
