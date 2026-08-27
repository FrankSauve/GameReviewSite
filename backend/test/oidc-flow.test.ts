import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";

import { GRAPHQL_PATH } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { SESSION_COOKIE } from "../src/lib/session";
import { resetClientCache } from "../src/lib/oidc";
import { resetDatabase, startApp } from "./helpers";
import { startStubProvider, type StubProvider } from "./stubProvider";

/**
 * The authorization code flow, run for real against an in-process OpenID
 * Provider whose ID tokens are RS256-signed and verified against its JWKS.
 *
 * Everything else in the suite tests refusals. This is the only place the happy
 * path is exercised, which matters because the happy path is where the ID token
 * validation, the provisioning call and the session issue all live.
 */

const REDIRECT_URI = "http://127.0.0.1:4000/auth/callback";

/** Pulls one cookie's value out of a Set-Cookie response header. */
function cookieValue(res: request.Response, name: string): string | null {
  const jar = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  for (const entry of jar) {
    const [pair] = entry.split(";");
    if (!pair) continue;
    const index = pair.indexOf("=");
    if (pair.slice(0, index) === name) return pair.slice(index + 1);
  }
  return null;
}

function cookieAttributes(res: request.Response, name: string): string {
  const jar = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  return jar.find((entry) => entry.startsWith(`${name}=`)) ?? "";
}

describe("the authorization code flow, end to end", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let provider: StubProvider;

  beforeAll(async () => {
    provider = await startStubProvider(REDIRECT_URI);

    process.env["OIDC_ISSUER"] = provider.issuer;
    process.env["OIDC_CLIENT_ID"] = provider.clientId;
    process.env["OIDC_CLIENT_SECRET"] = provider.clientSecret;
    process.env["OIDC_REDIRECT_URI"] = REDIRECT_URI;
    resetClientCache();

    ({ app, stop } = await startApp());
  });

  afterAll(async () => {
    await stop();
    await provider.close();
    for (const name of [
      "OIDC_ISSUER",
      "OIDC_CLIENT_ID",
      "OIDC_CLIENT_SECRET",
      "OIDC_REDIRECT_URI",
    ]) {
      delete process.env[name];
    }
    resetClientCache();
  });

  beforeEach(async () => {
    await resetDatabase();
    provider.forceNonce(null);
    provider.setClaims({
      sub: "stub-sub-0001",
      preferred_username: "simon",
      email: "simon@example.com",
    });
  });

  /**
   * Walks the flow the way a browser would: hit /auth/login, follow the redirect
   * to the provider, follow its redirect back to /auth/callback carrying the
   * transaction cookie.
   */
  async function signIn(returnTo = "/games/42") {
    const login = await request(app).get(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    expect(login.status).toBe(302);

    const txCookie = cookieValue(login, "gr_oidc_tx");
    expect(txCookie).not.toBeNull();

    // The provider redirects straight back with a code, as authentik does once
    // the person has authenticated.
    const authorize = await fetch(login.headers["location"] as string, {
      redirect: "manual",
    });
    expect(authorize.status).toBe(302);

    const back = new URL(authorize.headers.get("location") as string);
    const callback = await request(app)
      .get(`/auth/callback${back.search}`)
      .set("Cookie", `gr_oidc_tx=${txCookie}`);

    return { login, callback };
  }

  it("signs someone in and lands them back where they started", async () => {
    const { callback } = await signIn("/games/42");

    expect(callback.status).toBe(302);
    expect(callback.headers["location"]).toBe("/games/42");
    expect(cookieValue(callback, SESSION_COOKIE)).toBeTruthy();
  });

  it("asks for the scopes it needs, with PKCE", async () => {
    await signIn();
    const authorize = provider.authorizeRequests.at(-1);

    expect(authorize?.searchParams.get("scope")).toBe("openid profile email");
    expect(authorize?.searchParams.get("response_type")).toBe("code");
    expect(authorize?.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize?.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorize?.searchParams.get("nonce")).toBeTruthy();
    expect(authorize?.searchParams.get("state")).toBeTruthy();
  });

  it("issues a session that then authenticates GraphQL", async () => {
    const { callback } = await signIn();
    const session = cookieValue(callback, SESSION_COOKIE);

    const me = await request(app)
      .post(GRAPHQL_PATH)
      .set("content-type", "application/json")
      .set("Cookie", `${SESSION_COOKIE}=${session}`)
      .send({ query: "{ me { username email } }" });

    expect(me.body.data.me).toMatchObject({
      username: "simon",
      email: "simon@example.com",
    });
  });

  it("provisions the local row from the sub claim", async () => {
    await signIn();

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      authentikUid: "stub-sub-0001",
      username: "simon",
      email: "simon@example.com",
    });
  });

  it("gives the session cookie the flags that make it a session cookie", async () => {
    const { callback } = await signIn();
    const attributes = cookieAttributes(callback, SESSION_COOKIE);

    expect(attributes).toMatch(/HttpOnly/i);
    expect(attributes).toMatch(/SameSite=Lax/i);
    expect(attributes).toMatch(/Path=\//);
    // Not Secure here: these tests do not run as production, and a Secure cookie
    // over plain http would simply be dropped.
    expect(attributes).not.toMatch(/Secure/i);
  });

  it("reuses the existing row when the same person signs in twice", async () => {
    await signIn();
    const first = await prisma.user.findFirstOrThrow();
    await signIn();

    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.user.findFirstOrThrow()).id).toBe(first.id);
    expect(await prisma.session.count()).toBe(2);
  });

  it("picks up a rename in authentik at the next sign-in", async () => {
    await signIn();
    provider.setClaims({
      sub: "stub-sub-0001",
      preferred_username: "simon-renamed",
      email: "simon@example.com",
    });
    await signIn();

    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.user.findFirstOrThrow()).username).toBe("simon-renamed");
  });

  it("falls back to the email local part when there is no username claim", async () => {
    provider.setClaims({ sub: "stub-sub-0002", email: "nameless@example.com" });
    await signIn();

    expect((await prisma.user.findFirstOrThrow()).username).toBe("nameless");
  });

  /**
   * The nonce is what stops an ID token obtained elsewhere being replayed into
   * this session. openid-client checks it; this proves the check is reached.
   */
  it("refuses an ID token whose nonce is not the one it asked for", async () => {
    provider.forceNonce("a-nonce-nobody-asked-for");
    const { callback } = await signIn();

    expect(callback.status).toBe(400);
    expect(cookieValue(callback, SESSION_COOKIE)).toBeNull();
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it("refuses to send a returnTo off-site even when the login succeeds", async () => {
    const { callback } = await signIn("//evil.example.com/");

    expect(callback.status).toBe(302);
    expect(callback.headers["location"]).toBe("/");
  });

  it("hands back authentik's end-session URL on logout, and drops the row", async () => {
    const { callback } = await signIn();
    const session = cookieValue(callback, SESSION_COOKIE);

    const logout = await request(app)
      .post("/auth/logout")
      .set("Cookie", `${SESSION_COOKIE}=${session}`);

    expect(logout.status).toBe(200);
    expect(logout.body.endSessionUrl).toContain(`${provider.issuer}/end-session`);
    // The id_token_hint is why the session stores the token at all.
    expect(logout.body.endSessionUrl).toContain("id_token_hint=");
    expect(await prisma.session.count()).toBe(0);
  });

  it("does not contact the provider again once signed in", async () => {
    const { callback } = await signIn();
    const session = cookieValue(callback, SESSION_COOKIE);
    const afterLogin = provider.tokenRequestCount();

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(GRAPHQL_PATH)
        .set("content-type", "application/json")
        .set("Cookie", `${SESSION_COOKIE}=${session}`)
        .send({ query: "{ me { username } }" });
    }

    // No refresh token is requested, so there is nothing to refresh and no
    // reason to talk to authentik on a normal request.
    expect(provider.tokenRequestCount()).toBe(afterLogin);
  });
});
