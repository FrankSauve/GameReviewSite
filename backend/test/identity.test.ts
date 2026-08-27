import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import {
  ALICE,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  startApp,
} from "./helpers";

/**
 * The trust boundary. Identity arrives in HTTP headers, so these are the tests
 * that stop the whole scheme from being a formality.
 */
describe("identity trust boundary", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("treats a request with no headers as anonymous", async () => {
    const res = await authedQuery(app, "{ me { id username } }");
    expect(res.data).toEqual({ me: null });
  });

  it("authenticates when the proxy secret and identity headers are both present", async () => {
    const res = await authedQuery<{ me: { username: string; email: string } }>(
      app,
      "{ me { username email } }",
      ALICE
    );
    expect(res.data?.me).toMatchObject({
      username: "alice",
      email: "alice@example.com",
    });
  });

  it("ignores identity headers that arrive without the proxy secret", async () => {
    const res = await authedQuery(app, "{ me { username } }", undefined, {
      "x-authentik-uid": ALICE.uid,
      "x-authentik-username": ALICE.username,
      "x-authentik-email": ALICE.email!,
    });
    expect(res.data).toEqual({ me: null });
  });

  it("ignores identity headers accompanied by a wrong proxy secret", async () => {
    const res = await authedQuery(app, "{ me { username } }", undefined, {
      "x-proxy-secret": "not-the-secret",
      "x-authentik-uid": ALICE.uid,
      "x-authentik-username": ALICE.username,
    });
    expect(res.data).toEqual({ me: null });
  });

  /**
   * CVE-2026-25748: a malformed cookie made authentik's auth endpoint succeed
   * without setting any X-authentik-* headers. An app that reads "no header"
   * as "trusted upstream" grants access. A partial header set must fail closed.
   */
  it("rejects a partial header set (uid present, username missing)", async () => {
    const res = await authedQuery(app, "{ me { username } }", undefined, {
      "x-proxy-secret": "test-proxy-secret",
      "x-authentik-uid": ALICE.uid,
    });
    expect(res.data).toEqual({ me: null });
  });

  it("treats a blank username header as absent rather than as a user", async () => {
    const res = await authedQuery(app, "{ me { username } }", undefined, {
      "x-proxy-secret": "test-proxy-secret",
      "x-authentik-uid": ALICE.uid,
      "x-authentik-username": "   ",
    });
    expect(res.data).toEqual({ me: null });
  });

  it("never honours identity headers on the public endpoint", async () => {
    const res = await publicQuery(app, "{ me { username } }", {
      "x-proxy-secret": "test-proxy-secret",
      "x-authentik-uid": ALICE.uid,
      "x-authentik-username": ALICE.username,
      "x-authentik-email": ALICE.email!,
    });
    expect(res.data).toEqual({ me: null });
  });

  it("refuses writes smuggled to the public endpoint with valid credentials", async () => {
    const res = await publicQuery(
      app,
      'mutation { createGame(input: { title: "Smuggled" }) { id } }',
      {
        "x-proxy-secret": "test-proxy-secret",
        "x-authentik-uid": ALICE.uid,
        "x-authentik-username": ALICE.username,
      }
    );
    expect(errorCodes(res)).toContain("UNAUTHENTICATED");

    const games = await publicQuery<{ games: unknown[] }>(app, "{ games { id } }");
    expect(games.data?.games).toEqual([]);
  });
});
