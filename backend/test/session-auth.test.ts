import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { GRAPHQL_PATH } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { SESSION_COOKIE, createSession } from "../src/lib/session.js";
import { provisionUser } from "../src/lib/identity.js";
import {
  ALICE,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  sessionFor,
  startApp,
} from "./helpers.js";

/**
 * The trust boundary. It used to be a shared secret on a proxy header; it is now
 * a session cookie looked up in the database. Everything here is a way of
 * arriving without a valid one, and every one of them must come out anonymous.
 */
describe("session trust boundary", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  const meAs = (cookie: string) =>
    request(app)
      .post(GRAPHQL_PATH)
      .set("content-type", "application/json")
      .set("Cookie", cookie)
      .send({ query: "{ me { id username } }" });

  it("treats a request with no cookie as anonymous", async () => {
    const res = await publicQuery(app, "{ me { id username } }");
    expect(res.data).toEqual({ me: null });
  });

  it("authenticates a request carrying a valid session", async () => {
    const res = await authedQuery<{ me: { username: string; email: string } }>(
      app,
      "{ me { username email } }",
      ALICE,
    );
    expect(res.data?.me).toMatchObject({
      username: "alice",
      email: "alice@example.com",
    });
  });

  it("treats an unknown session token as anonymous", async () => {
    const res = await meAs(`${SESSION_COOKIE}=not-a-real-session-token`);
    expect(res.body.data).toEqual({ me: null });
  });

  /**
   * The cookie holds a random token and the table holds its SHA-256, so a
   * near-miss must miss entirely — there is no prefix or partial match to
   * exploit.
   */
  it("treats a tampered session token as anonymous", async () => {
    const cookie = await sessionFor(ALICE);
    const token = cookie.slice(`${SESSION_COOKIE}=`.length);
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;

    const res = await meAs(`${SESSION_COOKIE}=${tampered}`);
    expect(res.body.data).toEqual({ me: null });
  });

  it("treats an expired session as anonymous, and clears it away", async () => {
    const user = await provisionUser(ALICE);
    const { token } = await createSession(user.id, "id-token");
    await prisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await meAs(`${SESSION_COOKIE}=${token}`);
    expect(res.body.data).toEqual({ me: null });
    expect(await prisma.session.count()).toBe(0);
  });

  /** Sessions cascade from the user, so a deleted account cannot leave a
   *  working cookie behind. */
  it("treats a session whose user is gone as anonymous", async () => {
    const cookie = await sessionFor(ALICE);
    await prisma.user.deleteMany();

    const res = await meAs(cookie);
    expect(res.body.data).toEqual({ me: null });
    expect(await prisma.session.count()).toBe(0);
  });

  /**
   * Regression guard on the migration itself. These headers used to be identity
   * and the proxy secret used to make them trusted; both are now inert, and
   * nothing should ever make them mean anything again.
   */
  it("ignores the authentik proxy headers entirely", async () => {
    const res = await publicQuery(app, "{ me { username } }", {
      "x-proxy-secret": "test-proxy-secret",
      "x-authentik-uid": ALICE.uid,
      "x-authentik-username": ALICE.username,
      "x-authentik-email": "alice@example.com",
    });
    expect(res.data).toEqual({ me: null });
    expect(await prisma.user.count()).toBe(0);
  });

  it("refuses a mutation from a caller with no session", async () => {
    const res = await publicQuery(
      app,
      'mutation { createGame(input: { title: "Smuggled" }) { id } }',
    );
    expect(errorCodes(res)).toContain("UNAUTHENTICATED");

    const games = await publicQuery<{ games: unknown[] }>(
      app,
      "{ games { id } }",
    );
    expect(games.data?.games).toEqual([]);
  });

  it("stops honouring a session once it is signed out", async () => {
    const cookie = await sessionFor(ALICE);
    expect((await meAs(cookie)).body.data.me).not.toBeNull();

    await request(app).post("/auth/logout").set("Cookie", cookie).expect(200);

    expect((await meAs(cookie)).body.data).toEqual({ me: null });
    expect(await prisma.session.count()).toBe(0);
  });

  it("keeps one user's session from being another's", async () => {
    const alice = await sessionFor(ALICE);
    const bob = await sessionFor({
      uid: "ak-bob",
      username: "bob",
      email: "bob@example.com",
    });

    expect((await meAs(alice)).body.data.me.username).toBe("alice");
    expect((await meAs(bob)).body.data.me.username).toBe("bob");
  });
});

/**
 * A cookie is attached by the browser to requests another site initiates, which
 * proxy headers never were. This is the boundary that replaces that difference.
 */
describe("cross-origin requests", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  const from = (origin: string, cookie?: string) => {
    const req = request(app)
      .post(GRAPHQL_PATH)
      .set("content-type", "application/json")
      .set("Origin", origin);
    if (cookie) req.set("Cookie", cookie);
    return req.send({ query: "{ me { username } }" });
  };

  it("refuses a request naming a foreign origin, session or not", async () => {
    const cookie = await sessionFor(ALICE);
    expect((await from("https://evil.example.com")).status).toBe(403);
    expect((await from("https://evil.example.com", cookie)).status).toBe(403);
  });

  it("refuses an unparseable Origin", async () => {
    expect((await from("not a url")).status).toBe(403);
  });

  it("allows a request whose Origin is this host", async () => {
    const res = await request(app)
      .post(GRAPHQL_PATH)
      .set("content-type", "application/json")
      .set("Host", "gamereviews.example.com")
      .set("Origin", "https://gamereviews.example.com")
      .send({ query: "{ me { username } }" });
    expect(res.status).toBe(200);
  });

  /** curl, the healthcheck and the test suite send no Origin and carry no
   *  ambient credentials, so they are not what this guards against. */
  it("allows a request with no Origin at all", async () => {
    const res = await publicQuery(app, "{ me { username } }");
    expect(res.data).toEqual({ me: null });
  });
});
