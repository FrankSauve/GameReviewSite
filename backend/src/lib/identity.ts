import type { User } from "@prisma/client";
import { prisma } from "./prisma.js";
import { isProduction } from "../security.js";
import { slugify, uniqueSlug } from "./slug.js";

/**
 * Who a request is from. `uid` is the ID token's `sub` claim and the only field
 * treated as a stable key — username and email are authentik's to change.
 */
export interface Identity {
  uid: string;
  username: string;
  email: string | null;
}

/**
 * Local-development escape hatch, since there is no authentik in front of
 * `docker compose up` and no OIDC provider to redirect to.
 * Format: `uid:username:email`.
 *
 * Ignored outright in production. Unset it to browse as an anonymous visitor.
 */
export function devIdentity(): Identity | null {
  if (isProduction()) return null;
  const raw = process.env["AUTH_DEV_IDENTITY"];
  if (!raw) return null;

  const [uid, username, email] = raw.split(":");
  if (!uid || !username) return null;

  return { uid, username, email: email ?? null };
}

/** Prisma unique-constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/**
 * Which unique field(s) a P2002 collided on. Postgres reports either the field
 * list or the index name, so match loosely.
 */
function conflictsOn(err: unknown, field: string): boolean {
  const target = (err as { meta?: { target?: unknown } } | null)?.meta?.target;
  const names = Array.isArray(target)
    ? target.map(String)
    : typeof target === "string"
      ? [target]
      : [];
  // Nothing reported: assume every unique field is suspect, so the caller
  // applies both mitigations rather than retrying into the same failure.
  if (names.length === 0) return true;
  return names.some((name) => name.toLowerCase().includes(field.toLowerCase()));
}

async function newUserSlug(username: string): Promise<string> {
  return uniqueSlug(
    slugify(username, "user"),
    async (candidate) => (await prisma.user.count({ where: { slug: candidate } })) > 0
  );
}

/**
 * Maps an authentik identity onto a local row, creating it on first sight.
 *
 * authentik owns username and email, so both are refreshed when they drift —
 * at login, so a rename lands the next time the person signs in.
 */
export async function provisionUser(identity: Identity): Promise<User> {
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

  let username = identity.username;
  let email = identity.email;

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.user.create({
        data: {
          authentikUid: identity.uid,
          slug: await newUserSlug(username),
          username,
          email,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= 2) throw err;

      const usernameClash = conflictsOn(err, "username");
      const emailClash = conflictsOn(err, "email");
      const slugClash = conflictsOn(err, "slug");
      // Something else is unique-conflicting (a concurrent request on the same
      // uid, say). Retrying would just fail identically.
      if (!usernameClash && !emailClash && !slugClash) throw err;

      if (usernameClash) username = `${identity.username}-${identity.uid.slice(0, 6)}`;
      if (emailClash) email = null;
    }
  }
}
