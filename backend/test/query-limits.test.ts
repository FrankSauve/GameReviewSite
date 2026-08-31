import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import {
  authedQuery,
  publicQuery,
  resetDatabase,
  startApp,
} from "./helpers.js";

/**
 * The schema is cyclic (Review → user → reviews → comments → review → …), so
 * without a depth limit one request can recurse until the process falls over.
 */
function nestedQuery(levels: number): string {
  let inner = "username";
  for (let i = 0; i < levels; i++) {
    inner = `user { reviews { comments { review { ${inner} } } } }`;
  }
  return `{ reviews { ${inner} } }`;
}

describe("query abuse limits", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("accepts the depth the frontend actually uses", async () => {
    const res = await publicQuery(
      app,
      "{ recentReviews { id content user { username } game { title } comments { content user { username } } } }",
    );
    expect(res.errors).toBeUndefined();
  });

  it("rejects a deeply nested query on the public endpoint", async () => {
    const res = await publicQuery(app, nestedQuery(3));
    expect(res.errors?.[0]?.message).toMatch(/depth limit/i);
  });

  it("rejects a deeply nested query on the authenticated endpoint too", async () => {
    const res = await authedQuery(app, nestedQuery(3));
    expect(res.errors?.[0]?.message).toMatch(/depth limit/i);
  });

  /**
   * A list of scalars is part of the row it hangs off, not a set of extra rows.
   * Counting `Game.genres` as a nested collection charged a page of games fifty
   * rows for it, which put the games listing the SPA sends on every page load
   * over the budget and rejected it.
   */
  it("does not charge scalar lists against the row budget", async () => {
    const res = await publicQuery(
      app,
      "{ games { id title genres coverUrl releaseYear } }",
    );
    expect(res.errors).toBeUndefined();
  });

  /**
   * The home feed asks for reactions and comments per review, so its page size
   * is a literal in the document: a variable limit is priced at the field's
   * maximum and the same shape is refused. See frontend/src/graphql/queries.ts.
   */
  it("accepts the feed's shape at its literal page size", async () => {
    const selection = "{ id reactions { emoji } comments { id } }";
    const literal = await publicQuery(
      app,
      `{ recentReviews(limit: 10) ${selection} }`,
    );
    expect(literal.errors).toBeUndefined();

    const variable = await publicQuery(
      app,
      `query Feed($limit: Int) { recentReviews(limit: $limit) ${selection} }`,
      {},
      { limit: 10 },
    );
    expect(variable.errors?.[0]?.message).toMatch(
      /could return up to \d+ records/,
    );
  });

  it("rejects a query with an excessive number of aliases", async () => {
    const aliases = Array.from(
      { length: 40 },
      (_, i) => `a${i}: recentReviewsCount`,
    ).join(" ");
    const res = await publicQuery(app, `{ ${aliases} }`);
    expect(res.errors?.[0]?.message).toMatch(/alias/i);
  });
});
