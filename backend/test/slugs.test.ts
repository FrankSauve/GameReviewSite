import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import {
  ALICE,
  BOB,
  authedQuery,
  publicQuery,
  resetDatabase,
  startApp,
  PLAYTIME_INPUT,
} from "./helpers.js";

interface GamePayload {
  id: string;
  slug: string;
  title: string;
}

interface ReviewPayload {
  id: string;
  slug: string;
}

async function addGameAs(
  app: Express,
  identity: typeof ALICE,
  title: string
): Promise<GamePayload> {
  const res = await authedQuery<{ createGame: GamePayload }>(
    app,
    `mutation { createGame(input: { title: "${title}" }) { id slug title } }`,
    identity
  );
  expect(res.errors).toBeUndefined();
  return res.data!.createGame;
}

async function reviewAs(
  app: Express,
  identity: typeof ALICE,
  gameId: string
): Promise<ReviewPayload> {
  const res = await authedQuery<{ createReview: ReviewPayload }>(
    app,
    `mutation {
       createReview(input: {
         gameId: "${gameId}", rating: 8, content: "Good", ${PLAYTIME_INPUT}
       }) { id slug }
     }`,
    identity
  );
  expect(res.errors).toBeUndefined();
  return res.data!.createReview;
}

/**
 * `slugify` is pure and has no database in it, so these are plain unit tests. The
 * rest of the file is about the property that actually matters: a URL carrying a
 * slug and a URL carrying the UUID it replaced both resolve to the same row.
 */
describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    expect(slugify("Elden Ring")).toBe("elden-ring");
  });

  it("strips diacritics rather than turning them into dashes", () => {
    expect(slugify("Pokémon Snap")).toBe("pokemon-snap");
  });

  it("collapses punctuation into single dashes", () => {
    expect(slugify("Marvel's Spider-Man: Miles Morales")).toBe(
      "marvel-s-spider-man-miles-morales"
    );
  });

  it("keeps digits, which are often the whole title", () => {
    expect(slugify("Portal 2")).toBe("portal-2");
    expect(slugify("2048")).toBe("2048");
  });

  it("leaves no leading or trailing dash", () => {
    expect(slugify("  ...Hello!  ")).toBe("hello");
  });

  it("caps the length without leaving a trailing dash", () => {
    const slug = slugify("a".repeat(40) + " " + "b".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  /** A title in a script that survives neither decomposition nor the filter. */
  it("falls back rather than producing an empty slug", () => {
    expect(slugify("日本語")).toBe("untitled");
    expect(slugify("!!!", "game")).toBe("game");
  });
});

describe("readable URLs", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  describe("games", () => {
    it("gives a new game a slug derived from its title", async () => {
      const game = await addGameAs(app, ALICE, "Elden Ring");
      expect(game.slug).toBe("elden-ring");
    });

    it("resolves a game by its slug", async () => {
      const game = await addGameAs(app, ALICE, "Elden Ring");
      const res = await publicQuery<{ game: GamePayload | null }>(
        app,
        `{ game(id: "elden-ring") { id title } }`
      );
      expect(res.data?.game?.id).toBe(game.id);
    });

    /** The whole point of accepting both: links shared before slugs existed. */
    it("still resolves a game by its UUID", async () => {
      const game = await addGameAs(app, ALICE, "Elden Ring");
      const res = await publicQuery<{ game: GamePayload | null }>(
        app,
        `{ game(id: "${game.id}") { slug } }`
      );
      expect(res.data?.game?.slug).toBe("elden-ring");
    });

    it("returns null for a slug that belongs to nothing", async () => {
      const res = await publicQuery<{ game: GamePayload | null }>(
        app,
        `{ game(id: "no-such-game") { id } }`
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.game).toBeNull();
    });

    it("disambiguates a second game sharing a title", async () => {
      const first = await addGameAs(app, ALICE, "Hades");
      const second = await addGameAs(app, BOB, "Hades");
      expect(first.slug).toBe("hades");
      expect(second.slug).toBe("hades-2");
    });

    /**
     * A slug is fixed at insert. Following the title would break every link to
     * the game the moment somebody corrected a typo in it.
     */
    it("keeps the original slug after the title is edited", async () => {
      const game = await addGameAs(app, ALICE, "Elden Rng");
      const res = await authedQuery<{ updateGame: GamePayload }>(
        app,
        `mutation { updateGame(id: "${game.id}", input: { title: "Elden Ring" }) { slug title } }`,
        ALICE
      );
      expect(res.data?.updateGame.title).toBe("Elden Ring");
      expect(res.data?.updateGame.slug).toBe("elden-rng");
    });
  });

  describe("users", () => {
    it("resolves a profile by username", async () => {
      await addGameAs(app, ALICE, "Anything");
      const res = await publicQuery<{ user: { username: string } | null }>(
        app,
        `{ user(id: "${ALICE.username}") { username } }`
      );
      expect(res.data?.user?.username).toBe(ALICE.username);
    });

    it("still resolves a profile by UUID", async () => {
      await addGameAs(app, ALICE, "Anything");
      const alice = await prisma.user.findUniqueOrThrow({
        where: { username: ALICE.username },
      });
      const res = await publicQuery<{ user: { username: string } | null }>(
        app,
        `{ user(id: "${alice.id}") { username } }`
      );
      expect(res.data?.user?.username).toBe(ALICE.username);
    });

    /**
     * The profile page passes whatever the URL gave it straight through as
     * `userId`, so this list has to accept a username too or the page renders a
     * profile header with no reviews under it.
     */
    it("lists a user's review summaries by username", async () => {
      const game = await addGameAs(app, ALICE, "Elden Ring");
      await reviewAs(app, ALICE, game.id);

      const res = await publicQuery<{ reviewSummariesByUser: ReviewPayload[] }>(
        app,
        `{ reviewSummariesByUser(userId: "${ALICE.username}") { slug } }`
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.reviewSummariesByUser).toHaveLength(1);
      expect(res.data?.reviewSummariesByUser[0].slug).toBe("elden-ring-by-alice");
    });
  });

  describe("reviews", () => {
    it("names a review after its game and its author", async () => {
      const game = await addGameAs(app, ALICE, "Elden Ring");
      const review = await reviewAs(app, ALICE, game.id);
      expect(review.slug).toBe("elden-ring-by-alice");
    });

    it("resolves a review by its slug", async () => {
      const game = await addGameAs(app, ALICE, "Elden Ring");
      const review = await reviewAs(app, ALICE, game.id);
      const res = await publicQuery<{ review: ReviewPayload | null }>(
        app,
        `{ review(id: "elden-ring-by-alice") { id } }`
      );
      expect(res.data?.review?.id).toBe(review.id);
    });

    it("still resolves a review by its UUID", async () => {
      const game = await addGameAs(app, ALICE, "Elden Ring");
      const review = await reviewAs(app, ALICE, game.id);
      const res = await publicQuery<{ review: ReviewPayload | null }>(
        app,
        `{ review(id: "${review.id}") { slug } }`
      );
      expect(res.data?.review?.slug).toBe("elden-ring-by-alice");
    });

    it("gives two people reviewing the same game distinct slugs", async () => {
      const game = await addGameAs(app, ALICE, "Elden Ring");
      const byAlice = await reviewAs(app, ALICE, game.id);
      const byBob = await reviewAs(app, BOB, game.id);
      expect(byAlice.slug).toBe("elden-ring-by-alice");
      expect(byBob.slug).toBe("elden-ring-by-bob");
    });

    it("lists a game's reviews by the game's slug", async () => {
      const game = await addGameAs(app, ALICE, "Elden Ring");
      await reviewAs(app, ALICE, game.id);
      const res = await publicQuery<{ reviewsByGame: ReviewPayload[] }>(
        app,
        `{ reviewsByGame(gameId: "elden-ring") { slug } }`
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.reviewsByGame).toHaveLength(1);
    });
  });
});
