import { afterEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { publicQuery, resetDatabase } from "./helpers";

/**
 * Apollo Server does not mask error messages by default. It strips the stack
 * trace in production and leaves the message, so an unexpected throw reached the
 * client verbatim — a resolver failure surfaced as
 * "RAWG_API_KEY is not configured. Get a free key at https://rawg.io/apidocs and
 * add it to backend/.env", and a Prisma failure would have named tables,
 * columns and constraints the same way.
 *
 * RAWG_API_KEY is unset in the test environment, so searchGamesExternal is a
 * genuine internal failure rather than a simulated one.
 */
const INTERNAL_FAILURE = '{ searchGamesExternal(query: "halo") { rawgId } }';

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
  process.env["AUTH_PROXY_SECRET"] = "test-proxy-secret";
  const { createApp } = await import("../src/app");
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
    await resetDatabase();
  });

  it("withholds an internal failure's message in production", async () => {
    // Silence the deliberate server-side log this test provokes.
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app, stop } = await appFor("production");

    const res = await publicQuery(app, INTERNAL_FAILURE);

    expect(res.errors?.[0]?.message).toBe("Internal server error.");
    expect(res.errors?.[0]?.message).not.toMatch(/RAWG_API_KEY|apidocs|\.env/);
    expect(res.errors?.[0]?.extensions?.code).toBe("INTERNAL_SERVER_ERROR");

    // Withheld from the client, but not from the operator.
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
    await stop();
  });

  it("keeps the real message outside production, where it is the point", async () => {
    const { app, stop } = await appFor("test");
    const res = await publicQuery(app, INTERNAL_FAILURE);
    expect(res.errors?.[0]?.message).toMatch(/RAWG_API_KEY/);
    await stop();
  });

  it("still returns messages the caller is meant to act on, in production", async () => {
    const { app, stop } = await appFor("production");

    // A validation failure: the message is the interface.
    const badField = await publicQuery(app, "{ recentReviews { nope } }");
    expect(badField.errors?.[0]?.extensions?.code).toBe(
      "GRAPHQL_VALIDATION_FAILED"
    );
    expect(badField.errors?.[0]?.message).not.toBe("Internal server error.");

    // An authorization failure likewise.
    const anonWrite = await publicQuery(
      app,
      'mutation { createGame(input: { title: "x" }) { id } }'
    );
    expect(anonWrite.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    expect(anonWrite.errors?.[0]?.message).toMatch(/logged in/i);

    await stop();
  });

  it("never forwards anything but the code under extensions", async () => {
    const { app, stop } = await appFor("test");
    const res = await publicQuery(app, "{ recentReviews { nope } }");
    expect(Object.keys(res.errors?.[0]?.extensions ?? {})).toEqual(["code"]);
    await stop();
  });
});
