import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { communityGenres } from "../src/lib/communityGenres.js";
import {
  ALICE,
  BOB,
  authedQuery,
  publicQuery,
  resetDatabase,
  seedGame,
  startApp,
} from "./helpers.js";

const filed = (genre: string | null, secondaryGenres: string[] = []) => ({
  genre,
  secondaryGenres,
});

/** Counts each spelling, as the loader's SQL does, then ranks the counts. */
function ofReviews(reviews: ReturnType<typeof filed>[]) {
  const tally = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts].map(([value, count]) => ({ value, count }));
  };
  return communityGenres(
    tally(reviews.flatMap((r) => (r.genre == null ? [] : [r.genre]))),
    tally(reviews.flatMap((r) => r.secondaryGenres)),
  );
}

describe("ranking the genres a game's reviewers filed", () => {
  it("puts the most-filed genre first", () => {
    expect(
      ofReviews([filed("RPG"), filed("Action"), filed("RPG")]).genres,
    ).toEqual(["RPG", "Action"]);
  });

  it("counts spellings of one genre together, under the commonest", () => {
    expect(
      ofReviews([filed("rpg"), filed("RPG"), filed("RPG"), filed("Action")])
        .genres,
    ).toEqual(["RPG", "Action"]);
  });

  it("breaks a tie by name", () => {
    expect(ofReviews([filed("Shooter"), filed("Horror")]).genres).toEqual([
      "Horror",
      "Shooter",
    ]);
  });

  it("ignores unfiled reviews", () => {
    expect(ofReviews([filed(null), filed("  ")]).genres).toEqual([]);
  });

  it("leaves out a secondary genre someone filed as the genre", () => {
    expect(
      ofReviews([
        filed("Horror", ["Action"]),
        filed("Action", ["Horror", "Story"]),
      ]),
    ).toEqual({ genres: ["Action", "Horror"], secondaryGenres: ["Story"] });
  });

  it("leaves out a secondary genre filed as the genre below the top five", () => {
    const genres = ["A", "A", "B", "B", "C", "C", "D", "D", "E", "E", "Horror"];
    expect(
      ofReviews([...genres.map((g) => filed(g)), filed(null, ["Horror"])])
        .secondaryGenres,
    ).toEqual([]);
  });
});

const SUMMARIES = `query Summaries($id: ID!) {
  reviewSummariesByUser(userId: $id) {
    game { communityGenres communitySecondaryGenres }
  }
}`;

const ME = "{ me { id } }";

describe("a game's community genres", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  async function review(
    identity: typeof ALICE,
    gameId: string,
    genre: string | null,
    secondaryGenres: string[] = [],
  ) {
    const res = await authedQuery(
      app,
      `mutation Create($input: CreateReviewInput!) { createReview(input: $input) { id } }`,
      identity,
      {},
      {
        input: {
          gameId,
          rating: 8,
          content: "Played it.",
          yearPlayed: 2024,
          hoursPlayed: 12,
          genre,
          secondaryGenres,
        },
      },
    );
    expect(res.errors).toBeUndefined();
  }

  async function summariesOf(identity: typeof BOB) {
    const me = await authedQuery<{ me: { id: string } }>(app, ME, identity);
    const res = await publicQuery<{
      reviewSummariesByUser: {
        game: { communityGenres: string[]; communitySecondaryGenres: string[] };
      }[];
    }>(app, SUMMARIES, {}, { id: me.data!.me.id });
    expect(res.errors).toBeUndefined();
    return res.data!.reviewSummariesByUser.map((r) => r.game);
  }

  it("carries what another reviewer filed to an unfiled review", async () => {
    const gameId = await seedGame("Alan Wake");
    await review(ALICE, gameId, "Horror", ["Story-driven"]);
    await review(BOB, gameId, null);

    expect(await summariesOf(BOB)).toEqual([
      {
        communityGenres: ["Horror"],
        communitySecondaryGenres: ["Story-driven"],
      },
    ]);
  });

  it("keeps each game's genres to itself when one request loads several", async () => {
    const wake = await seedGame("Alan Wake");
    const celeste = await seedGame("Celeste");
    await review(ALICE, wake, "horror", ["Story"]);
    await review(ALICE, celeste, "Platformer", ["Horror"]);
    await review(BOB, wake, null);
    await review(BOB, celeste, null);

    expect(
      (await summariesOf(BOB)).sort((a, b) =>
        (a.communityGenres[0] ?? "").localeCompare(b.communityGenres[0] ?? ""),
      ),
    ).toEqual([
      { communityGenres: ["horror"], communitySecondaryGenres: ["Story"] },
      { communityGenres: ["Platformer"], communitySecondaryGenres: ["Horror"] },
    ]);
  });

  it("is empty for a game nobody filed", async () => {
    await review(BOB, await seedGame("Celeste"), null);

    expect(await summariesOf(BOB)).toEqual([
      { communityGenres: [], communitySecondaryGenres: [] },
    ]);
  });
});
