import { afterEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { ALICE, authedQuery, publicQuery, resetDatabase } from "./helpers.js";

/**
 * Apollo Server does not mask error messages, so an internal failure's own
 * message must be withheld in production: it can name a config file, a table
 * or a constraint. A 401 from Steam is ours, not an outage, so it is one.
 */
const INTERNAL_FAILURE =
  '{ externalGame(source: STEAM, id: "1") { externalId } }';
const INTERNAL_MESSAGE = /Steam API returned 401/;

function refuseEveryFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response("{}", { status: 401 }),
  );
}

/**
 * `isProduction()` is read at call time, not at construction time — formatError
 * consults it per request. So NODE_ENV has to stay set for the duration of the
 * request, and is restored by the returned handle rather than immediately.
 */
async function appFor(nodeEnv: string): Promise<{
  app: Express;
  stop: () => Promise<void>;
}> {
  vi.resetModules();
  const previous = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = nodeEnv;
  // createApp refuses to boot in production with no way to sign in. Never
  // contacted: these tests only exercise error formatting.
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

describe("error message disclosure", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await resetDatabase();
  });

  it("withholds an internal failure's message in production", async () => {
    // Silence the deliberate server-side log this test provokes.
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    refuseEveryFetch();
    const { app, stop } = await appFor("production");

    const res = await authedQuery(app, INTERNAL_FAILURE, ALICE);

    expect(res.errors?.[0]?.message).toBe("Internal server error.");
    expect(res.errors?.[0]?.message).not.toMatch(INTERNAL_MESSAGE);
    expect(res.errors?.[0]?.extensions?.code).toBe("INTERNAL_SERVER_ERROR");

    // Withheld from the client, but not from the operator.
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
    await stop();
  });

  it("keeps the real message outside production, where it is the point", async () => {
    refuseEveryFetch();
    const { app, stop } = await appFor("test");
    const res = await authedQuery(app, INTERNAL_FAILURE, ALICE);
    expect(res.errors?.[0]?.message).toMatch(INTERNAL_MESSAGE);
    await stop();
  });

  it("still returns messages the caller is meant to act on, in production", async () => {
    const { app, stop } = await appFor("production");

    // A validation failure: the message is the interface.
    const badField = await publicQuery(app, "{ recentReviews { nope } }");
    expect(badField.errors?.[0]?.extensions?.code).toBe(
      "GRAPHQL_VALIDATION_FAILED",
    );
    expect(badField.errors?.[0]?.message).not.toBe("Internal server error.");

    // An authorization failure likewise.
    const anonWrite = await publicQuery(
      app,
      'mutation { createReview(input: { source: STEAM, externalId: "1", rating: 8, content: "x", yearPlayed: 2024, hoursPlayed: 1 }) { id } }',
    );
    expect(anonWrite.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    expect(anonWrite.errors?.[0]?.message).toMatch(/signed in/i);

    await stop();
  });

  /**
   * The case the three above missed. A resolver's own validation is the only
   * account a caller gets of what the rule is, and a bare GraphQLError carries
   * no code, so Apollo defaulted it to INTERNAL_SERVER_ERROR and every one of
   * these messages was replaced in production. Schema validation and auth both
   * set their own codes, so neither showed it.
   */
  it("returns a resolver's own validation message in production", async () => {
    const { app, stop } = await appFor("production");

    const res = await authedQuery(
      app,
      'mutation { createReview(input: { source: STEAM, externalId: "1", rating: 8, content: "   ", yearPlayed: 2024, hoursPlayed: 1 }) { id } }',
      ALICE,
    );

    expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    expect(res.errors?.[0]?.message).toMatch(/must not be empty/);

    await stop();
  });

  it("never forwards anything but the code under extensions", async () => {
    const { app, stop } = await appFor("test");
    const res = await publicQuery(app, "{ recentReviews { nope } }");
    expect(Object.keys(res.errors?.[0]?.extensions ?? {})).toEqual(["code"]);
    await stop();
  });
});
