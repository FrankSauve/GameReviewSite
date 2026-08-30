import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { publicQuery, resetDatabase, startApp } from "./helpers.js";

/**
 * A request whose own size is fixed must not be able to ask for a response whose
 * size is not. Before these bounds, a 249-byte anonymous query returned 2.6 MB
 * and grew with the table — every list field was unbounded, and each relation
 * field issued its own query per parent row.
 *
 * graphql-armor does not cover this. Its cost limit scores the shape of a query
 * before any row is read, and the shape of the abusive query is small.
 */

/** The exact query from the security review. */
const AMPLIFYING_QUERY = `{
  reviews {
    id content
    user { id username reviews { id content comments { id content } } }
    game { id title reviews { id content } }
    comments { id content user { id username } }
  }
}`;

async function seed(users: number, gamesEach: number, commentsEach: number) {
  for (let u = 0; u < users; u++) {
    await prisma.user.create({
      data: {
        authentikUid: `uid-${u}`,
        username: `user${u}`,
        slug: `user${u}`,
        email: `u${u}@e.com`,
      },
    });
  }
  for (let g = 0; g < gamesEach; g++) {
    await prisma.game.create({ data: { title: `Game ${g}`, slug: `game-${g}` } });
  }
  const allUsers = await prisma.user.findMany();
  const allGames = await prisma.game.findMany();
  for (const user of allUsers) {
    for (const game of allGames) {
      const review = await prisma.review.create({
        data: {
          slug: `${user.username}/${game.slug}`,
          userId: user.id,
          gameId: game.id,
          rating: 7,
          content: "x".repeat(200),
        },
      });
      for (let c = 0; c < commentsEach; c++) {
        await prisma.comment.create({
          data: { userId: user.id, reviewId: review.id, content: "c".repeat(100) },
        });
      }
    }
  }
}

describe("response size bounds", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("rejects the amplifying query before reading a single row", async () => {
    const res = await publicQuery(app, AMPLIFYING_QUERY);
    expect(res.errors?.[0]?.message).toMatch(/could return up to \d+ records/);
    expect(res.data).toBeNull();
  });

  it("rejects it identically whether the database is empty or full", async () => {
    const empty = await publicQuery(app, AMPLIFYING_QUERY);
    await seed(8, 4, 2);
    const full = await publicQuery(app, AMPLIFYING_QUERY);

    // Same rejection, same size: the ceiling is a property of the query, not of
    // how much data happens to exist.
    expect(full.errors?.[0]?.message).toEqual(empty.errors?.[0]?.message);
  });

  it("reports the ceiling once, not once per affected field", async () => {
    const res = await publicQuery(app, AMPLIFYING_QUERY);
    expect(res.errors).toHaveLength(1);
  });

  it("clamps a root list limit to its ceiling instead of honouring it", async () => {
    await seed(4, 3, 0);
    const res = await publicQuery<{ reviews: { id: string }[] }>(
      app,
      "{ reviews(limit: 99999) { id } }"
    );
    expect(res.errors).toBeUndefined();
    // 12 rows exist; the point is that limit:99999 was not passed to the database.
    expect(res.data?.reviews.length).toBeLessThanOrEqual(100);
  });

  it("defaults an argument-less root list to a page rather than the whole table", async () => {
    await seed(6, 10, 0);
    const res = await publicQuery<{ reviews: { id: string }[] }>(
      app,
      "{ reviews { id } }"
    );
    expect(await prisma.review.count()).toBe(60);
    expect(res.data?.reviews).toHaveLength(50);
  });

  it("bounds a nested list too", async () => {
    await seed(1, 1, 60);
    const res = await publicQuery<{
      reviews: { comments: { id: string }[] }[];
    }>(app, "{ reviews { comments { id } } }");
    expect(res.errors).toBeUndefined();
    expect(res.data?.reviews[0]?.comments).toHaveLength(50);
  });

  it("serves a count without loading the rows it counts", async () => {
    await seed(1, 1, 60);
    const res = await publicQuery<{ reviews: { commentCount: number }[] }>(
      app,
      "{ reviews { commentCount } }"
    );
    expect(res.data?.reviews[0]?.commentCount).toBe(60);
  });

  /**
   * Usernames come from authentik, so an unbounded public `users` query is a
   * login-name roster for anyone probing the identity provider. Emails were
   * already withheld (see privacy.test.ts); the list length was not bounded.
   */
  it("bounds the public account list", async () => {
    await seed(12, 1, 0);
    const res = await publicQuery<{ users: { id: string }[] }>(
      app,
      "{ users(limit: 99999) { id username } }"
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.users.length).toBeLessThanOrEqual(200);
  });

  it("bounds the public games list", async () => {
    await seed(1, 6, 0);
    const res = await publicQuery<{ games: { id: string }[] }>(
      app,
      "{ games(limit: 99999) { id title } }"
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.games.length).toBeLessThanOrEqual(200);
  });

  it("ignores a negative or absurd offset rather than passing it through", async () => {
    await seed(2, 3, 0);
    const res = await publicQuery<{ reviews: { id: string }[] }>(
      app,
      "{ reviews(limit: -5, offset: -100) { id } }"
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.reviews.length).toBeGreaterThan(0);
  });

  it("still serves every query the SPA sends", async () => {
    await seed(5, 5, 4);
    const game = await prisma.game.findFirst();
    const user = await prisma.user.findFirst();
    const review = await prisma.review.findFirst();

    const queries = [
      "{ games { id title genres platforms coverUrl releaseYear averageRating reviewCount } }",
      "{ users { id username createdAt reviewCount averageRating } }",
      "{ recentReviews(limit: 10, offset: 0) { id rating content createdAt user { id username } game { id title genres coverUrl releaseYear } comments { id content createdAt user { id username } } } recentReviewsCount }",
      `{ game(id: "${game?.id}") { id title description averageRating reviews { id rating content user { id username } comments { id content user { id username } } } } }`,
      `{ user(id: "${user?.id}") { id username createdAt reviews { id rating content game { id title } comments { id } } } }`,
      `{ review(id: "${review?.id}") { id rating content user { id username } game { id title } comments { id content user { id username } } } }`,
    ];

    for (const query of queries) {
      const res = await publicQuery(app, query);
      expect(res.errors, query.slice(0, 40)).toBeUndefined();
    }
  });
});
