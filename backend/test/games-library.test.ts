import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import {
  ALICE,
  publicQuery,
  resetDatabase,
  sessionFor,
  startApp,
} from "./helpers.js";

/**
 * The catalogue listing, now that it is paged rather than returned whole.
 *
 * The listing itself is old; what is new is that a caller sees one window of it
 * at a time, and both the filter and the total that describes the windows moved
 * to the server. Each of those is a way to hand back a page that looks perfectly
 * reasonable and is wrong.
 */

const LIST = `query List($limit: Int, $offset: Int, $reviewedOnly: Boolean) {
  games(limit: $limit, offset: $offset, reviewedOnly: $reviewedOnly) { title }
  gamesCount(reviewedOnly: $reviewedOnly)
}`;

interface ListPayload {
  games: { title: string }[];
  gamesCount: number;
}

/** Games created at one instant, as a bulk import produces. */
async function seedBatch(titles: string[], createdAt: Date): Promise<void> {
  for (const title of titles) {
    await prisma.game.create({
      data: { title, slug: slugify(title, "game"), createdAt },
    });
  }
}

async function reviewGame(title: string): Promise<void> {
  await sessionFor(ALICE);
  const [user, game] = await Promise.all([
    prisma.user.findFirstOrThrow(),
    prisma.game.findFirstOrThrow({ where: { title } }),
  ]);
  await prisma.review.create({
    data: {
      rating: 8,
      content: "Played it.",
      yearPlayed: 2024,
      hoursPlayed: 12,
      slug: `${game.slug}-by-${user.username}`,
      gameId: game.id,
      userId: user.id,
    },
  });
}

describe("the games listing", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  describe("paging", () => {
    it("returns the window asked for", async () => {
      await seedBatch(["A", "B", "C", "D", "E"], new Date("2026-01-01"));
      const res = await publicQuery<ListPayload>(app, LIST, {}, {
        limit: 2,
        offset: 2,
      });
      expect(res.errors).toBeUndefined();
      expect(res.data?.games).toHaveLength(2);
    });

    it("counts the whole catalogue, not the page", async () => {
      await seedBatch(["A", "B", "C", "D", "E"], new Date("2026-01-01"));
      const res = await publicQuery<ListPayload>(app, LIST, {}, { limit: 2 });
      expect(res.data?.gamesCount).toBe(5);
    });

    /**
     * The reason the ordering carries an id tiebreaker.
     *
     * Every one of these rows has the same `createdAt` to the millisecond, which
     * is what importing a backlog in one go produces. Ordered by that column
     * alone, Postgres may return equal keys in a different order per query, and
     * the pages are then windows onto two different orderings: a game shows up
     * twice and another is unreachable. Walking every page and checking the
     * union is the assertion, because that is the symptom.
     */
    it("shows each game exactly once across pages of a same-instant import", async () => {
      const titles = Array.from({ length: 12 }, (_, i) => `Game ${i + 1}`);
      await seedBatch(titles, new Date("2026-01-01T00:00:00.000Z"));

      const seen: string[] = [];
      for (let page = 0; page < 4; page++) {
        const res = await publicQuery<ListPayload>(app, LIST, {}, {
          limit: 3,
          offset: page * 3,
        });
        seen.push(...(res.data?.games ?? []).map((g) => g.title));
      }

      expect(seen).toHaveLength(12);
      expect([...new Set(seen)].sort()).toEqual([...titles].sort());
    });

    it("returns an empty page past the end rather than erroring", async () => {
      await seedBatch(["A"], new Date("2026-01-01"));
      const res = await publicQuery<ListPayload>(app, LIST, {}, {
        limit: 10,
        offset: 100,
      });
      expect(res.errors).toBeUndefined();
      expect(res.data?.games).toEqual([]);
      // The total still describes the library, so the client can recover.
      expect(res.data?.gamesCount).toBe(1);
    });
  });

  describe("the reviewedOnly filter", () => {
    beforeEach(async () => {
      await seedBatch(["Reviewed", "Untouched"], new Date("2026-01-01"));
      await reviewGame("Reviewed");
    });

    it("drops games nobody has reviewed", async () => {
      const res = await publicQuery<ListPayload>(app, LIST, {}, {
        reviewedOnly: true,
      });
      expect(res.data?.games.map((g) => g.title)).toEqual(["Reviewed"]);
    });

    it("returns the whole catalogue when it is not asked for", async () => {
      const res = await publicQuery<ListPayload>(app, LIST, {});
      expect(res.data?.games).toHaveLength(2);
    });

    /**
     * The count has to read the same filter as the listing. A total of two
     * against pages holding one renders paging controls for a page that will
     * always come back empty.
     */
    it("counts what the same filter would list", async () => {
      const res = await publicQuery<ListPayload>(app, LIST, {}, {
        reviewedOnly: true,
      });
      expect(res.data?.gamesCount).toBe(1);
    });
  });
});
