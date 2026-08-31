import { afterEach, describe, expect, it, vi } from "vitest";
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
 * importGame validates everything client-supplied before it calls RAWG.
 */
const imp = (fields: string) =>
  `mutation { importGame(input: { ${fields} }) { id } }`;
const create = (fields: string) =>
  `mutation { createGame(input: { ${fields} }) { id } }`;

const CASES: Array<[string, string, string]> = [
  [
    "rawgId",
    imp('rawgId: "abc", title: "X"'),
    "rawgId must be a positive integer.",
  ],
  [
    "coverUrl not absolute",
    imp('rawgId: "1", title: "X", coverUrl: "notaurl"'),
    "coverUrl must be an absolute URL.",
  ],
  [
    "coverUrl scheme",
    imp('rawgId: "1", title: "X", coverUrl: "http://x.test/a.png"'),
    "coverUrl must use https.",
  ],
  [
    "coverUrl length",
    imp(
      `rawgId: "1", title: "X", coverUrl: "https://x.test/${"a".repeat(2100)}"`,
    ),
    "coverUrl must be at most 2000 characters.",
  ],
  [
    "label length",
    create(`title: "X", genres: ["${"g".repeat(120)}"]`),
    "Each genre must be at most 100 characters.",
  ],
  [
    "releaseYear",
    create('title: "X", releaseYear: 1000'),
    "releaseYear must be a valid game release year.",
  ],
  [
    "title empty (hoisted validateString)",
    create('title: "   "'),
    "title must not be empty.",
  ],
];

describe("validation messages carry a code, so they survive production", () => {
  afterEach(async () => {
    await resetDatabase();
  });

  it.each(CASES)("%s", async (_name, query, expected) => {
    const { app, stop } = await appFor("production");
    try {
      const res = await authedQuery(app, query, ALICE);
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
