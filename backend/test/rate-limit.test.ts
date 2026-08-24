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
});
