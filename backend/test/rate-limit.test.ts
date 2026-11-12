import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { GRAPHQL_PATH } from "../src/app.js";

/**
 * Rate limiting protects two things: the process, and the game sources' quotas. The
 * limits are lowered here through the environment so the test stays fast.
 */
describe("rate limiting", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    process.env["RATE_LIMIT_MAX"] = "5";
    process.env["GAME_SOURCE_RATE_LIMIT_MAX"] = "2";
    // Imported after the environment is set: the limiters read it when the app
    // is constructed.
    const { createApp } = await import("../src/app.js");
    ({ app, stop } = await createApp());
  });

  afterAll(async () => {
    await stop();
    delete process.env["RATE_LIMIT_MAX"];
    delete process.env["GAME_SOURCE_RATE_LIMIT_MAX"];
    delete process.env["AUTH_RATE_LIMIT_MAX"];
  });

  const send = (query: string) =>
    request(app)
      .post(GRAPHQL_PATH)
      .set("content-type", "application/json")
      .send({ query });

  it("returns 429 once the general limit is exceeded", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push((await send("{ recentReviewsCount }")).status);
    }
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  it("limits game-source fields far more tightly than ordinary queries", async () => {
    const { createApp } = await import("../src/app.js");
    const fresh = await createApp();
    const lookup = () =>
      request(fresh.app)
        .post(GRAPHQL_PATH)
        .set("content-type", "application/json")
        .send({
          query: '{ externalGame(source: TGDB, id: "1") { externalId } }',
        });

    const first = await lookup();
    const second = await lookup();
    const third = await lookup();

    // The first two get through the limiter, then fail as anonymous; only the
    // limiter's answer matters here.
    expect(first.status).not.toBe(429);
    expect(second.status).not.toBe(429);
    expect(third.status).toBe(429);

    await fresh.stop();
  });

  /**
   * Apollo answers a query sent as a GET with the document in the query string,
   * which `express.json()` leaves out of `req.body`: the limiter must read both.
   */
  it("counts a game-source query against its bucket when it arrives as a GET", async () => {
    const { createApp } = await import("../src/app.js");
    const fresh = await createApp();
    const document = '{ externalGame(source: TGDB, id: "1") { externalId } }';

    const get = () =>
      request(fresh.app)
        .get(GRAPHQL_PATH)
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

  it("shares one game-source bucket across both methods", async () => {
    const { createApp } = await import("../src/app.js");
    const fresh = await createApp();
    const document = '{ externalGame(source: TGDB, id: "1") { externalId } }';

    const posted = await request(fresh.app)
      .post(GRAPHQL_PATH)
      .set("content-type", "application/json")
      .send({ query: document });
    const alsoPosted = await request(fresh.app)
      .post(GRAPHQL_PATH)
      .set("content-type", "application/json")
      .send({ query: document });
    // Bucket of 2 is now spent by POSTs; a GET must not get a fresh allowance.
    const viaGet = await request(fresh.app)
      .get(GRAPHQL_PATH)
      .set("apollo-require-preflight", "true")
      .query({ query: document });

    expect(posted.status).not.toBe(429);
    expect(alsoPosted.status).not.toBe(429);
    expect(viaGet.status).toBe(429);

    await fresh.stop();
  });

  /**
   * The /auth routes have their own bucket because they are not GraphQL and are
   * cheap to abuse: /login makes this app do discovery and issue a redirect.
   */
  it("limits sign-in attempts separately from GraphQL", async () => {
    process.env["AUTH_RATE_LIMIT_MAX"] = "3";
    const { createApp } = await import("../src/app.js");
    const fresh = await createApp();

    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push((await request(fresh.app).get("/auth/login")).status);
    }

    // 503 rather than 302: OIDC is unconfigured in this suite. What matters is
    // that the fourth attempt is refused by the limiter instead.
    expect(codes.slice(0, 3)).toEqual([503, 503, 503]);
    expect(codes.slice(3)).toEqual([429, 429]);

    await fresh.stop();
  });
});
