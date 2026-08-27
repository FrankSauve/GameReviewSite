import * as oidc from "openid-client";
import { isProduction } from "../security.js";

/**
 * GameReviews as a confidential OIDC client.
 *
 * authentik is the OpenID Provider; this app is the Relying Party. The browser
 * never sees a token — the authorization code is exchanged server-side and the
 * result becomes a session cookie (see lib/session.ts). That is the
 * backend-for-frontend shape, and it is what makes it safe for the SPA and the
 * API to share one origin.
 *
 * Only the ID token matters here. This app never calls authentik again after
 * login: it does not read userinfo, does not introspect, and does not refresh.
 * All it needs is proof of who the user is, once.
 */

const SCOPES = "openid profile email";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Optional. Omitted by default: authentik requires it to be registered as a
   *  redirect URI, and an unregistered value breaks logout, so it is opt-in. */
  postLogoutRedirectUri: string | null;
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function oidcConfig(): OidcConfig | null {
  const issuer = env("OIDC_ISSUER");
  const clientId = env("OIDC_CLIENT_ID");
  const clientSecret = env("OIDC_CLIENT_SECRET");
  const redirectUri = env("OIDC_REDIRECT_URI");

  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;

  const postLogout = env("OIDC_POST_LOGOUT_REDIRECT_URI");
  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    postLogoutRedirectUri: postLogout || null,
  };
}

export function oidcConfigured(): boolean {
  return oidcConfig() !== null;
}

/**
 * Refuses to serve production traffic with no way for anybody to sign in.
 *
 * Called from createApp before the port is bound, replacing the equivalent
 * check that used to guard the proxy shared secret.
 */
export function assertOidcConfig(): void {
  if (isProduction() && !oidcConfigured()) {
    throw new Error(
      "OIDC is not configured. Set OIDC_ISSUER, OIDC_CLIENT_ID, " +
        "OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI. Without them nobody can " +
        "sign in, because this app is the OAuth2 client — there is no proxy " +
        "to authenticate on its behalf."
    );
  }
}

/**
 * Discovery is a network call, so it happens once and is memoised. The promise
 * itself is cached rather than the result, so concurrent first requests share
 * one round trip. A failure is not cached — otherwise authentik being briefly
 * unreachable at boot would poison sign-in until the next restart.
 */
let configPromise: Promise<oidc.Configuration> | null = null;

export async function getConfiguration(): Promise<oidc.Configuration> {
  const settings = oidcConfig();
  if (!settings) throw new Error("OIDC is not configured.");

  if (!configPromise) {
    configPromise = oidc
      .discovery(new URL(settings.issuer), settings.clientId, settings.clientSecret, undefined, {
        // openid-client 6 refuses plain HTTP by default, which is the right
        // default and the reason this is conditional rather than absent: the
        // test suite runs against a stub provider on http://127.0.0.1, and
        // production must never be allowed to.
        ...(isProduction() ? {} : { execute: [oidc.allowInsecureRequests] }),
      })
      .catch((err: unknown) => {
        configPromise = null;
        throw err;
      });
  }

  return configPromise;
}

/** Only for tests, which construct apps repeatedly in one process. */
export function resetClientCache(): void {
  configPromise = null;
}

export interface AuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * PKCE is used even though this is a confidential client with a secret. It costs
 * nothing and it binds the authorization code to this specific request, so a
 * code leaked from a redirect (browser history, a referrer, a proxy log) cannot
 * be redeemed by anyone else.
 */
export async function createAuthorizationRequest(): Promise<AuthorizationRequest> {
  const settings = oidcConfig();
  if (!settings) throw new Error("OIDC is not configured.");

  const config = await getConfiguration();

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: settings.redirectUri,
    scope: SCOPES,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return { url: url.href, state, nonce, codeVerifier };
}

export interface OidcIdentity {
  /** The `sub` claim. Stored as User.authentikUid. */
  uid: string;
  username: string;
  email: string | null;
  /** Passed back as id_token_hint when signing out. */
  idToken: string;
}

/**
 * Falls back through the claims authentik might supply. `preferred_username`
 * is what the profile scope normally yields; the rest are here so a provider
 * configured with unusual scope mappings still produces something usable rather
 * than failing the login.
 */
function pickUsername(claims: Record<string, unknown>, sub: string): string {
  for (const key of ["preferred_username", "nickname", "name"]) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const email = claims["email"];
  if (typeof email === "string" && email.includes("@")) {
    const local = email.split("@")[0];
    if (local) return local;
  }
  return sub;
}

export interface CallbackParams {
  state: string;
  nonce: string;
  codeVerifier: string;
  /**
   * The callback URL as it was actually requested, query string included.
   * openid-client derives the `redirect_uri` it sends to the token endpoint
   * from this, so it has to be the registered value rather than anything
   * reconstructed loosely.
   */
  currentUrl: URL;
}

/**
 * Completes the code exchange.
 *
 * `authorizationCodeGrant` is doing the security-critical work: it verifies the
 * ID token signature against the provider's JWKS, checks `iss`, `aud` and
 * expiry, confirms the `state` and `nonce` match what was asked for, and sends
 * the PKCE verifier so the provider can confirm the code was issued to this
 * request. It throws on any of those failing, which is why the caller treats an
 * exception as "not signed in" rather than trying to interpret a partial result.
 */
export async function completeAuthorization({
  state,
  nonce,
  codeVerifier,
  currentUrl,
}: CallbackParams): Promise<OidcIdentity> {
  const config = await getConfiguration();

  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedNonce: nonce,
    expectedState: state,
  });

  const claims = tokens.claims() as Record<string, unknown> | undefined;
  const sub = claims?.["sub"];
  if (typeof sub !== "string" || !sub) {
    throw new Error("ID token carried no sub claim.");
  }

  if (!tokens.id_token) {
    throw new Error("Token response carried no id_token.");
  }

  const email = claims?.["email"];

  return {
    uid: sub,
    username: pickUsername(claims ?? {}, sub),
    email: typeof email === "string" && email.includes("@") ? email : null,
    idToken: tokens.id_token,
  };
}

/**
 * Where to send the browser so authentik ends its own session too, not just
 * ours. Returns null when OIDC is unconfigured or the provider advertises no
 * end-session endpoint, in which case the caller has still cleared the local
 * session and simply has nowhere further to send anyone.
 */
export async function endSessionUrl(idToken: string): Promise<string | null> {
  const settings = oidcConfig();
  if (!settings) return null;

  const config = await getConfiguration();
  if (!config.serverMetadata().end_session_endpoint) return null;

  return oidc.buildEndSessionUrl(config, {
    id_token_hint: idToken,
    ...(settings.postLogoutRedirectUri
      ? { post_logout_redirect_uri: settings.postLogoutRedirectUri }
      : {}),
  }).href;
}
