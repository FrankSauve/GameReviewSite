import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import request from "supertest";
import type { Express } from "express";

import { resetClientCache } from "../src/lib/oidc.js";
import { safeReturnTo } from "../src/routes/auth.js";
import { SESSION_COOKIE } from "../src/lib/session.js";
import { resetDatabase, startApp } from "./helpers.js";

/**
 * The /auth routes, minus the parts that need a live provider. The full
 * authorization code flow is exercised against a stub provider separately;
 * these cover the refusals, which are the cases an attacker controls.
 */

const OIDC_ENV = [
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_REDIRECT_URI",
] as const;

function clearOidcEnv(): void {
  for (const name of OIDC_ENV) delete process.env[name];
  resetClientCache();
}

/** Points at a closed port, so discovery fails immediately rather than hanging. */
function configureUnreachableProvider(): void {
  process.env["OIDC_ISSUER"] = "http://127.0.0.1:1/application/o/gamereviews/";
  process.env["OIDC_CLIENT_ID"] = "gamereviews";
  process.env["OIDC_CLIENT_SECRET"] = "shhh";
  process.env["OIDC_REDIRECT_URI"] =
    "https://gamereviews.example.com/auth/callback";
  resetClientCache();
}

describe("returnTo is confined to this site", () => {
  it("keeps an ordinary path", () => {
    expect(safeReturnTo("/games/42")).toBe("/games/42");
    expect(safeReturnTo("/?q=zelda#top")).toBe("/?q=zelda#top");
  });

  /** The case that catches people out: a browser reads these as absolute. */
  it("refuses protocol-relative URLs", () => {
    expect(safeReturnTo("//evil.example.com")).toBe("/");
    expect(safeReturnTo("/\\evil.example.com")).toBe("/");
  });

  it("refuses absolute URLs and scheme tricks", () => {
    expect(safeReturnTo("https://evil.example.com")).toBe("/");
    expect(safeReturnTo("javascript:alert(1)")).toBe("/");
    expect(safeReturnTo("data:text/html,x")).toBe("/");
  });

  it("refuses header injection and control characters", () => {
    expect(safeReturnTo("/ok\r\nLocation: https://evil.example.com")).toBe("/");
    expect(safeReturnTo("/ok\u0000")).toBe("/");
  });

  it("refuses anything absurd or absent", () => {
    expect(safeReturnTo("/" + "a".repeat(600))).toBe("/");
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo(["/a", "/b"])).toBe("/");
    expect(safeReturnTo("")).toBe("/");
  });
});

describe("auth routes", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await resetDatabase();
    clearOidcEnv();
  });
  afterEach(clearOidcEnv);

  it("says sign-in is unconfigured rather than failing obscurely", async () => {
    expect((await request(app).get("/auth/login")).status).toBe(503);
    expect((await request(app).get("/auth/callback")).status).toBe(503);
  });

  it("reports a provider it cannot reach as unavailable, not as a client error", async () => {
    configureUnreachableProvider();
    const res = await request(app).get("/auth/login");
    expect(res.status).toBe(502);
  });

  /**
   * Arriving at the callback without the cookie set by /auth/login means the
   * flow was not started here — a stale tab, or a forged callback.
   */
  it("refuses a callback carrying no transaction cookie", async () => {
    configureUnreachableProvider();
    const res = await request(app).get("/auth/callback?code=abc&state=xyz");
    expect(res.status).toBe(400);
    expect(res.text).not.toContain("127.0.0.1");
  });

  it("refuses a callback whose state does not match the transaction", async () => {
    configureUnreachableProvider();
    const tx = JSON.stringify({
      state: "the-real-state",
      nonce: "n",
      codeVerifier: "v",
      returnTo: "/",
    });
    const res = await request(app)
      .get("/auth/callback?code=abc&state=an-attackers-state")
      .set("Cookie", `gr_oidc_tx=${encodeURIComponent(tx)}`);
    expect(res.status).toBe(400);
  });

  it("treats a logout with no session as a no-op rather than an error", async () => {
    const res = await request(app).post("/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ endSessionUrl: null });
  });

  it("clears the session cookie on logout", async () => {
    const res = await request(app).post("/auth/logout");
    const setCookie = res.headers["set-cookie"] as unknown as
      string[] | undefined;
    expect(setCookie?.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(
      true,
    );
  });

  it("does not accept a logout over GET", async () => {
    const res = await request(app).get("/auth/logout");
    expect(res.status).toBe(404);
  });
});
