import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import type { User } from "@prisma/client";
import { prisma } from "./prisma.js";
import { isProduction } from "../security.js";

/**
 * Server-side sessions for the browser, issued after the OIDC code flow
 * completes (see lib/oidc.ts).
 *
 * Stored rather than signed cookies, because there is no refresh token —
 * authentik grants no `offline_access` — so deleting the row is the only
 * revocation there is. Revoking someone in authentik therefore does not end a
 * session already issued here; SESSION_TTL_HOURS bounds that lag.
 */

export const SESSION_COOKIE = "gr_session";

/** 30 days, matching the session duration configured in authentik, so the two
 *  do not expire at visibly different times. */
const DEFAULT_TTL_HOURS = 720;

export function sessionTtlMs(): number {
  const parsed = parseInt(process.env["SESSION_TTL_HOURS"] ?? "", 10);
  const hours =
    Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_TTL_HOURS : parsed;
  return hours * 60 * 60 * 1000;
}

/**
 * The cookie carries this; the database stores its digest. Reading the Session
 * table therefore does not yield anything that can be replayed as a cookie.
 */
function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedSession {
  /** Goes in the cookie. Never stored. */
  token: string;
  expiresAt: Date;
}

/** Replaces any session this browser already had, so signing in twice does not
 *  leave an orphan row behind. */
export async function createSession(
  userId: string,
  idToken: string,
): Promise<IssuedSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlMs());

  await prisma.session.create({
    data: { id: digest(token), userId, idToken, expiresAt },
  });

  return { token, expiresAt };
}

export interface ResolvedSession {
  user: User;
  idToken: string;
}

/** Fails closed on a missing, unknown or expired session. The trust boundary. */
export async function readSession(
  req: Request,
): Promise<ResolvedSession | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) return null;

  const found = await prisma.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  if (!found) return null;

  if (found.expiresAt.getTime() <= Date.now()) {
    // Opportunistic cleanup: expired rows are removed when next encountered,
    // which at this scale is enough to avoid a scheduled sweep.
    await prisma.session
      .deleteMany({ where: { expiresAt: { lte: new Date() } } })
      .catch(() => undefined);
    return null;
  }

  return { user: found.user, idToken: found.idToken };
}

/** Returns the id token that was stored with the session, for logout, and
 *  deletes the row. Safe to call when no session exists. */
export async function destroySession(req: Request): Promise<string | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) return null;

  const id = digest(token);
  const found = await prisma.session.findUnique({ where: { id } });
  if (!found) return null;

  await prisma.session.delete({ where: { id } }).catch(() => undefined);
  return found.idToken;
}

function cookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
} {
  return {
    httpOnly: true,
    // Set unconditionally in production. Left off otherwise so the local stack
    // works over plain http on a non-localhost hostname.
    secure: isProduction(),
    // Lax rather than Strict: the browser arrives at /auth/callback as a
    // top-level navigation from authentik, and Strict would withhold the
    // cookie on that first request back.
    sameSite: "lax",
    path: "/",
  };
}

export function setSessionCookie(res: Response, session: IssuedSession): void {
  res.cookie(SESSION_COOKIE, session.token, {
    ...cookieOptions(),
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

/**
 * Constant-time comparison of two same-length tokens. Exported for the
 * transaction cookie in routes/auth.ts, which compares an OAuth `state`.
 */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
