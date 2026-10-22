import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { ALICE, authedQuery, resetDatabase } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import { provisionUser } from "../src/lib/identity.js";
import { slugify } from "../src/lib/slug.js";

async function appFor(
  nodeEnv: string,
): Promise<{ app: Express; stop: () => Promise<void> }> {
  vi.resetModules();
  const previous = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = nodeEnv;
  process.env["OIDC_ISSUER"] = "http://127.0.0.1:1/application/o/gamereviews/";
  process.env["OIDC_CLIENT_ID"] = "gamereviews";
  process.env["OIDC_CLIENT_SECRET"] = "shhh";
  process.env["OIDC_REDIRECT_URI"] =
    "https://gamereviews.example.com/auth/callback";
  const { createApp } = await import("../src/app.js");
  const handle = await createApp();
  return {
    app: handle.app,
    stop: async () => {
      await handle.stop();
      process.env["NODE_ENV"] = previous;
    },
  };
}

/**
 * Every validator's message, driven through a production app.
 *
 * A bare GraphQLError has no extensions.code, Apollo defaults it to
 * INTERNAL_SERVER_ERROR, and sanitizeError replaces the message in production —
 * so the rule is enforced without ever saying what it was. Outside production
 * the real message is forwarded deliberately, which is why a test that does not
 * force NODE_ENV cannot see this at all.
 *
 * A rawgId is validated before RAWG is called. Game fields are checked on
 * updateGame, the one path that still takes them from the client.
 */
const fromRawg = (rawgId: string) =>
  `mutation { createReview(input: { rawgId: "${rawgId}", rating: 8, content: "ok", yearPlayed: 2024, hoursPlayed: 10 }) { id } }`;
const update = (fields: string) => (gameId: string) =>
  `mutation { updateGame(id: "${gameId}", input: { ${fields} }) { id } }`;

const CASES: Array<[string, (gameId: string) => string, string]> = [
  ["rawgId", () => fromRawg("abc"), "rawgId must be a positive integer."],
  [
    "neither gameId nor rawgId",
    () =>
      'mutation { createReview(input: { rating: 8, content: "ok", yearPlayed: 2024, hoursPlayed: 10 }) { id } }',
    "Give exactly one of gameId and rawgId.",
  ],
  [
    "label length",
    update(`genres: ["${"g".repeat(120)}"]`),
    "Each genre must be at most 100 characters.",
  ],
  [
    "releaseYear",
    update("releaseYear: 1000"),
    "releaseYear must be a valid game release year.",
  ],
  [
    "title empty (hoisted validateString)",
    update('title: "   "'),
    "title must not be empty.",
  ],
];

describe("validation messages carry a code, so they survive production", () => {
  beforeEach(resetDatabase);

  it.each(CASES)("%s", async (_name, query, expected) => {
    const { app, stop } = await appFor("production");
    try {
      const owner = await provisionUser(ALICE);
      const game = await prisma.game.create({
        data: { title: "Hades", slug: "hades", createdById: owner.id },
      });
      const res = await authedQuery(app, query(game.id), ALICE);
      expect(res.errors?.[0]?.message).toBe(expected);
      expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    } finally {
      await stop();
    }
  });

  it("rating, yearPlayed, hoursPlayed and the duplicate review", async () => {
    const { app, stop } = await appFor("production");
    try {
      const user = await provisionUser(ALICE);
      const game = await prisma.game.create({
        data: { title: "Hades", slug: slugify("Hades", "game") },
      });
      const review = (fields: string) =>
        `mutation { createReview(input: { gameId: "${game.id}", ${fields} }) { id } }`;
      const nextYear = new Date().getFullYear() + 1;

      const cases: Array<[string, string]> = [
        [
          review(
            'rating: 99, content: "ok", yearPlayed: 2024, hoursPlayed: 10',
          ),
          "rating must be between 1 and 10.",
        ],
        [
          review(
            'rating: 7.3, content: "ok", yearPlayed: 2024, hoursPlayed: 10',
          ),
          "rating must be a whole or half point, such as 9 or 9.5.",
        ],
        [
          review('rating: 8, content: "ok", yearPlayed: 1200, hoursPlayed: 10'),
          `yearPlayed must be a whole year between 1970 and ${nextYear}.`,
        ],
        [
          review(
            'rating: 8, content: "ok", yearPlayed: 2024, hoursPlayed: 99999',
          ),
          "hoursPlayed must be greater than 0 and at most 30000.",
        ],
        [
          review(
            'rating: 8, content: "ok", yearPlayed: 2024, hoursPlayed: 10, platform: "Ouya"',
          ),
          "platform must be one of the platforms offered.",
        ],
      ];

      for (const [query, expected] of cases) {
        const res = await authedQuery(app, query, ALICE);
        expect(res.errors?.[0]?.message).toBe(expected);
        expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
      }

      await prisma.review.create({
        data: {
          rating: 8,
          content: "ok",
          slug: "alice/hades",
          gameId: game.id,
          userId: user.id,
        },
      });
      const dup = await authedQuery(
        app,
        review(
          'rating: 9, content: "again", yearPlayed: 2024, hoursPlayed: 10',
        ),
        ALICE,
      );
      expect(dup.errors?.[0]?.message).toBe(
        "You have already reviewed this game.",
      );
      expect(dup.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    } finally {
      await stop();
    }
  });
});
