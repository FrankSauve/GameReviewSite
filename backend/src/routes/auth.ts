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
 * The endpoints that make this app an OAuth2 client. These must not sit behind
 * any proxy-level authentication — they *are* the authentication. See
 * deploy/swag/gamereviews.subdomain.conf.
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
 * Rejects anything that is not a path on this site. `returnTo` reaches a
 * Location header, so without this it is an open redirect (CWE-601).
 * Protocol-relative URLs are the trap: `//evil` is absolute to a browser.
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
 * Rebuilds the callback URL openid-client needs. Built on the configured
 * redirect URI, never the inbound Host header: that is the value the provider
 * validated, and a header would let a caller influence it.
 */
function callbackUrl(req: Request): URL {
  const settings = oidcConfig();
  const url = new URL(
    settings?.redirectUri ?? "http://localhost/auth/callback",
  );

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
 * Answers plainly rather than redirecting: redirecting to /auth/login from here
 * is how you build an infinite loop.
 */
function failCallback(res: Response, reason: string, err?: unknown): void {
  console.error(`OIDC callback rejected: ${reason}`, err ?? "");
  res
    .status(400)
    .type("text/plain")
    .send(
      "Sign-in could not be completed. Please return to the site and try again.",
    );
}

export function createAuthRouter(secureCookies: boolean): Router {
  const router = Router();

  router.get("/login", async (req: Request, res: Response) => {
    if (!oidcConfigured()) {
      res.status(503).type("text/plain").send("Sign-in is not configured.");
      return;
    }

    try {
      const { url, state, nonce, codeVerifier } =
        await createAuthorizationRequest();
      const transaction: Transaction = {
        state,
        nonce,
        codeVerifier,
        returnTo: safeReturnTo(req.query["returnTo"]),
      };

      res.cookie(
        TX_COOKIE,
        JSON.stringify(transaction),
        txCookieOptions(secureCookies),
      );
      res.redirect(url);
    } catch (err) {
      // Almost always discovery failing because authentik is unreachable.
      console.error("Could not start sign-in:", err);
      res
        .status(502)
        .type("text/plain")
        .send("Sign-in is temporarily unavailable.");
    }
  });

  router.get("/callback", async (req: Request, res: Response) => {
    if (!oidcConfigured()) {
      res.status(503).type("text/plain").send("Sign-in is not configured.");
      return;
    }

    const transaction = readTransaction(req);
    res.clearCookie(TX_COOKIE, {
      ...txCookieOptions(secureCookies),
      maxAge: undefined,
    });

    if (!transaction) {
      failCallback(res, "no usable transaction cookie");
      return;
    }

    // Checked here as well as inside the library so a mismatch is rejected
    // before the code is presented for exchange.
    const returnedState = req.query["state"];
    if (
      typeof returnedState !== "string" ||
      !tokensMatch(returnedState, transaction.state)
    ) {
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
   * tag. Answers with a URL rather than redirecting, because fetch() would
   * follow the redirect in the background.
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
