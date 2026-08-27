import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { PUBLIC_PATH } from "../src/app";

/**
 * Rate limiting protects two things: the process, and the RAWG API quota. The
 * limits are lowered here through the environment so the test stays fast.
 */
describe("rate limiting", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    process.env["RATE_LIMIT_MAX"] = "5";
    process.env["RAWG_RATE_LIMIT_MAX"] = "2";
    // Imported after the environment is set: the limiters read it when the app
    // is constructed.
    const { createApp } = await import("../src/app");
    ({ app, stop } = await createApp());
  });

  afterAll(async () => {
    await stop();
    delete process.env["RATE_LIMIT_MAX"];
    delete process.env["RAWG_RATE_LIMIT_MAX"];
  });

  const send = (query: string) =>
    request(app).post(PUBLIC_PATH).set("content-type", "application/json").send({ query });

  it("returns 429 once the general limit is exceeded", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push((await send("{ recentReviewsCount }")).status);
    }
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  it("limits RAWG-backed fields far more tightly than ordinary queries", async () => {
    const { createApp } = await import("../src/app");
    const fresh = await createApp();
    const rawg = () =>
      request(fresh.app)
        .post(PUBLIC_PATH)
        .set("content-type", "application/json")
        .send({ query: '{ searchGamesExternal(query: "halo") { rawgId } }' });

    const first = await rawg();
    const second = await rawg();
    const third = await rawg();

    // The first two get through the limiter (and then fail on the missing RAWG
    // key, which is fine — what matters is that the limiter let them past).
    expect(first.status).not.toBe(429);
    expect(second.status).not.toBe(429);
    expect(third.status).toBe(429);

    await fresh.stop();
  });

  /**
   * Apollo answers a query sent as a GET with the document in the query string.
   * The RAWG limiter used to read only `req.body`, which `express.json()` leaves
   * empty on a GET — so the same operation moved to the query string skipped the
   * RAWG bucket and fell back to the general limit, 300/min instead of 30/min.
   */
  it("counts a RAWG query against the RAWG bucket when it arrives as a GET", async () => {
    const { createApp } = await import("../src/app");
    const fresh = await createApp();
    const document = '{ searchGamesExternal(query: "halo") { rawgId } }';

    const get = () =>
      request(fresh.app)
        .get(PUBLIC_PATH)
        .set("apollo-require-preflight", "true")
        .query({ query: document });

    const codes = [
      (await get()).status,
      (await get()).status,
      (await get()).status,
      (await get()).status,
    ];

    // Bucket is 2, so the third and fourth must be refused. Before the fix all
    // four were served.
    expect(codes.slice(2)).toEqual([429, 429]);

    await fresh.stop();
  });

  it("shares one RAWG bucket across both methods", async () => {
    const { createApp } = await import("../src/app");
    const fresh = await createApp();
    const document = '{ searchGamesExternal(query: "halo") { rawgId } }';

    const posted = await request(fresh.app)
      .post(PUBLIC_PATH)
      .set("content-type", "application/json")
      .send({ query: document });
    const alsoPosted = await request(fresh.app)
      .post(PUBLIC_PATH)
      .set("content-type", "application/json")
      .send({ query: document });
    // Bucket of 2 is now spent by POSTs; a GET must not get a fresh allowance.
    const viaGet = await request(fresh.app)
      .get(PUBLIC_PATH)
      .set("apollo-require-preflight", "true")
      .query({ query: document });

    expect(posted.status).not.toBe(429);
    expect(alsoPosted.status).not.toBe(429);
    expect(viaGet.status).toBe(429);

    await fresh.stop();
  });
});
