import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { authedQuery, publicQuery, resetDatabase, startApp } from "./helpers";

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
      "{ recentReviews { id content user { username } game { title } comments { content user { username } } } }"
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

  it("rejects a query with an excessive number of aliases", async () => {
    const aliases = Array.from(
      { length: 40 },
      (_, i) => `a${i}: recentReviewsCount`
    ).join(" ");
    const res = await publicQuery(app, `{ ${aliases} }`);
    expect(res.errors?.[0]?.message).toMatch(/alias/i);
  });
});
