import { Router, type Request, type Response } from "express";

import { provisionUser } from "../lib/identity.js";
import {
  completeAuthorization,
  createAuthorizationRequest,
  endSessionUrl,
  oidcConfig,
  oidcConfigured,
} from "../lib/oidc.js";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  setSessionCookie,
  tokensMatch,
} from "../lib/session.js";

/**
 * The three endpoints that make this app an OAuth2 client.
 *
 *   GET  /auth/login     start the authorization code flow
 *   GET  /auth/callback  finish it, and issue a session
 *   POST /auth/logout    drop the session, and tell the caller where to go to
 *                        end the authentik session too
 *
 * These must not sit behind any proxy-level authentication — they *are* the
 * authentication. See deploy/swag/gamereviews.subdomain.conf.
 */

/** Carries state, nonce and the PKCE verifier across the redirect to authentik. */
const TX_COOKIE = "gr_oidc_tx";
const TX_TTL_MS = 10 * 60 * 1000;

interface Transaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

/**
 * Rejects anything that is not a path on this site.
 *
 * `returnTo` comes from the query string and ends up in a Location header, so
 * without this it is an open redirect (CWE-601) — a phishing link could send
 * someone through a genuine authentik login and then bounce them to an
 * attacker's page, which is exactly the kind of redirect users are trained to
 * trust. Protocol-relative URLs are the case that catches people out: `//evil`
 * is a valid absolute URL to a browser, not a path.
 */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (raw.length === 0 || raw.length > 512) return "/";
  // Control characters, including the newlines used for header injection.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "/";
  if (!raw.startsWith("/")) return "/";
  // "//host" and "/\host" are both read as protocol-relative by browsers.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

/**
 * Rebuilds the callback URL that openid-client needs to process the response.
 *
 * Built on the configured redirect URI rather than on the inbound Host header,
 * for two reasons: it is the value the provider validated the authorization
 * request against and the one it expects echoed back at the token endpoint, and
 * deriving it from a request header would let a caller influence it.
 */
function callbackUrl(req: Request): URL {
  const settings = oidcConfig();
  const url = new URL(settings?.redirectUri ?? "http://localhost/auth/callback");

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") params.append(key, value);
  }
  url.search = params.toString();

  return url;
}

function txCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/auth",
    maxAge: TX_TTL_MS,
  };
}

function readTransaction(req: Request): Transaction | null {
  const raw = req.cookies?.[TX_COOKIE];
  if (typeof raw !== "string" || !raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Transaction>;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.codeVerifier !== "string"
    ) {
      return null;
    }
    return {
      state: parsed.state,
      nonce: parsed.nonce,
      codeVerifier: parsed.codeVerifier,
      returnTo: safeReturnTo(parsed.returnTo),
    };
  } catch {
    return null;
  }
}

/**
 * A failed callback is nearly always a stale tab: the transaction cookie
 * expired, or the user pressed back and replayed a spent code. Answer plainly
 * rather than redirecting, because redirecting to /auth/login from here is how
 * you build an infinite loop.
 */
function failCallback(res: Response, reason: string, err?: unknown): void {
  console.error(`OIDC callback rejected: ${reason}`, err ?? "");
  res
    .status(400)
    .type("text/plain")
    .send("Sign-in could not be completed. Please return to the site and try again.");
}

export function createAuthRouter(secureCookies: boolean): Router {
  const router = Router();

  router.get("/login", async (req: Request, res: Response) => {
    if (!oidcConfigured()) {
      res.status(503).type("text/plain").send("Sign-in is not configured.");
      return;
    }

    try {
      const { url, state, nonce, codeVerifier } = await createAuthorizationRequest();
      const transaction: Transaction = {
        state,
        nonce,
        codeVerifier,
        returnTo: safeReturnTo(req.query["returnTo"]),
      };

      res.cookie(TX_COOKIE, JSON.stringify(transaction), txCookieOptions(secureCookies));
      res.redirect(url);
    } catch (err) {
      // Almost always discovery failing because authentik is unreachable.
      console.error("Could not start sign-in:", err);
      res.status(502).type("text/plain").send("Sign-in is temporarily unavailable.");
    }
  });

  router.get("/callback", async (req: Request, res: Response) => {
    if (!oidcConfigured()) {
      res.status(503).type("text/plain").send("Sign-in is not configured.");
      return;
    }

    const transaction = readTransaction(req);
    res.clearCookie(TX_COOKIE, { ...txCookieOptions(secureCookies), maxAge: undefined });

    if (!transaction) {
      failCallback(res, "no usable transaction cookie");
      return;
    }

    // Checked here as well as inside the library so a mismatch is rejected
    // before the code is presented for exchange.
    const returnedState = req.query["state"];
    if (typeof returnedState !== "string" || !tokensMatch(returnedState, transaction.state)) {
      failCallback(res, "state mismatch");
      return;
    }

    try {
      const identity = await completeAuthorization({
        state: transaction.state,
        nonce: transaction.nonce,
        codeVerifier: transaction.codeVerifier,
        currentUrl: callbackUrl(req),
      });

      const user = await provisionUser({
        uid: identity.uid,
        username: identity.username,
        email: identity.email,
      });

      const session = await createSession(user.id, identity.idToken);
      setSessionCookie(res, session);
      res.redirect(transaction.returnTo);
    } catch (err) {
      failCallback(res, "code exchange or token validation failed", err);
    }
  });

  /**
   * POST, not GET, so a third-party page cannot sign someone out with an image
   * tag. Answers with the URL to visit rather than redirecting, because the SPA
   * calls this with fetch() and would otherwise follow the redirect itself and
   * end authentik's session in a background request.
   */
  router.post("/logout", async (req: Request, res: Response) => {
    const idToken = await destroySession(req);
    clearSessionCookie(res);

    if (!idToken) {
      res.json({ endSessionUrl: null });
      return;
    }

    try {
      res.json({ endSessionUrl: await endSessionUrl(idToken) });
    } catch (err) {
      // The local session is already gone, which is the part that matters.
      console.error("Could not build the end-session URL:", err);
      res.json({ endSessionUrl: null });
    }
  });

  return router;
}
