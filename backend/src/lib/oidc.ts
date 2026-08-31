import * as oidc from "openid-client";
import { isProduction } from "../security.js";

/**
 * GameReviews as a confidential OIDC client, with authentik as the provider.
 *
 * The browser never sees a token: the code is exchanged server-side and the
 * result becomes a session cookie (see lib/session.ts). Only the ID token is
 * used — this app never calls authentik again after login.
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

/** Refuses to boot production with no way for anybody to sign in. */
export function assertOidcConfig(): void {
  if (isProduction() && !oidcConfigured()) {
    throw new Error(
      "OIDC is not configured. Set OIDC_ISSUER, OIDC_CLIENT_ID, " +
        "OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI. Without them nobody can " +
        "sign in, because this app is the OAuth2 client — there is no proxy " +
        "to authenticate on its behalf.",
    );
  }
}

/**
 * The promise is cached, not the result, so concurrent first requests share one
 * round trip. A failure is not cached: authentik briefly unreachable at boot
 * would otherwise poison sign-in until the next restart.
 */
let configPromise: Promise<oidc.Configuration> | null = null;

export async function getConfiguration(): Promise<oidc.Configuration> {
  const settings = oidcConfig();
  if (!settings) throw new Error("OIDC is not configured.");

  if (!configPromise) {
    configPromise = oidc
      .discovery(
        new URL(settings.issuer),
        settings.clientId,
        settings.clientSecret,
        undefined,
        {
          // openid-client 6 refuses plain HTTP by default, which is the right
          // default and the reason this is conditional rather than absent: the
          // test suite runs against a stub provider on http://127.0.0.1, and
          // production must never be allowed to.
          ...(isProduction() ? {} : { execute: [oidc.allowInsecureRequests] }),
        },
      )
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
 * PKCE even though this is a confidential client: it binds the code to this
 * request, so a code leaked from history, a referrer or a proxy log cannot be
 * redeemed by anyone else.
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

/** Falls back through the claims, so unusual scope mappings still log in. */
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
   * The callback URL as actually requested, query string included.
   * openid-client derives the token endpoint's `redirect_uri` from it, so it
   * must be the registered value, not anything loosely reconstructed.
   */
  currentUrl: URL;
}

/**
 * Completes the code exchange. `authorizationCodeGrant` throws on any
 * verification failure, so the caller treats an exception as "not signed in"
 * rather than interpreting a partial result.
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
 * Where to send the browser so authentik ends its own session too. Null when
 * unconfigured or unadvertised; the local session is cleared either way.
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
