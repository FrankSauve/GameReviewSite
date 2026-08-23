import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { isProduction } from "../security";

/**
 * Identity as asserted by the authentik proxy outpost.
 *
 * The outpost sets these headers after a successful auth_request. They are
 * only trustworthy because the backend is not reachable except through the
 * reverse proxy, and because the proxy proves itself with a shared secret
 * (see `proxyIsTrusted`).
 */
export interface ProxyIdentity {
  uid: string;
  username: string;
  email: string | null;
}

const HEADER_UID = "x-authentik-uid";
const HEADER_USERNAME = "x-authentik-username";
const HEADER_EMAIL = "x-authentik-email";
const HEADER_PROXY_SECRET = "x-proxy-secret";

const PROXY_SECRET = process.env["AUTH_PROXY_SECRET"] ?? "";

if (isProduction && !PROXY_SECRET) {
  throw new Error(
    "AUTH_PROXY_SECRET is not set. Identity comes from proxy headers, so " +
      "without this shared secret anyone who can reach the backend directly " +
      "could authenticate as any user."
  );
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Constant-time comparison that does not leak the secret's length. */
function secretMatches(provided: string): boolean {
  return timingSafeEqual(digest(provided), digest(PROXY_SECRET));
}

function proxyIsTrusted(req: Request): boolean {
  if (!PROXY_SECRET) return true; // development only; enforced above in production
  const provided = req.headers[HEADER_PROXY_SECRET];
  return typeof provided === "string" && secretMatches(provided);
}

function header(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Local-development escape hatch, since there is no authentik outpost in front
 * of `docker compose up`. Format: `uid:username:email`.
 *
 * Ignored outright in production — the shipped image sets NODE_ENV=production.
 */
function devIdentity(): ProxyIdentity | null {
  if (isProduction) return null;
  const raw = process.env["AUTH_DEV_IDENTITY"];
  if (!raw) return null;

  const [uid, username, email] = raw.split(":");
  if (!uid || !username) return null;

  console.warn(
    `⚠️  AUTH_DEV_IDENTITY is active — every request is treated as "${username}". Never use this in production.`
  );
  return { uid, username, email: email ?? null };
}

/**
 * Reads the caller's identity, or null if the request is not authenticated.
 *
 * Fails closed. When the outpost declines a request it leaves the identity
 * headers unset (this is the failure mode behind CVE-2026-25748), so a missing
 * header must mean "anonymous", never "trusted".
 */
export function readIdentity(req: Request): ProxyIdentity | null {
  const dev = devIdentity();
  if (dev) return dev;

  if (!proxyIsTrusted(req)) return null;

  const uid = header(req, HEADER_UID);
  const username = header(req, HEADER_USERNAME);
  if (!uid || !username) return null;

  return { uid, username, email: header(req, HEADER_EMAIL) };
}

/** Prisma unique-constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/**
 * Maps an authentik identity onto a local row, creating it on first sight.
 *
 * authentik owns the username and email, so both are refreshed when they drift.
 */
export async function provisionUser(identity: ProxyIdentity): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { authentikUid: identity.uid },
  });

  if (existing) {
    const drifted =
      existing.username !== identity.username || existing.email !== identity.email;
    if (!drifted) return existing;

    try {
      return await prisma.user.update({
        where: { id: existing.id },
        data: { username: identity.username, email: identity.email },
      });
    } catch (err) {
      // Another local row already holds that username or email. Keep the
      // stale-but-working values rather than failing the request.
      if (isUniqueViolation(err)) return existing;
      throw err;
    }
  }

  // Adopt a pre-authentik row with the same email, so accounts that existed
  // before the migration keep their reviews.
  if (identity.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: identity.email } });
    if (byEmail && byEmail.authentikUid === null) {
      return prisma.user.update({
        where: { id: byEmail.id },
        data: { authentikUid: identity.uid, username: identity.username },
      });
    }
  }

  try {
    return await prisma.user.create({
      data: {
        authentikUid: identity.uid,
        username: identity.username,
        email: identity.email,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Username taken by an unrelated account; disambiguate with the uid.
    return prisma.user.create({
      data: {
        authentikUid: identity.uid,
        username: `${identity.username}-${identity.uid.slice(0, 6)}`,
        email: identity.email,
      },
    });
  }
}
