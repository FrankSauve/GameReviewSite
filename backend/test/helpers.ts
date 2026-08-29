import request from "supertest";
import type { Express } from "express";
import { GRAPHQL_PATH, createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { provisionUser, type Identity } from "../src/lib/identity.js";
import { SESSION_COOKIE, createSession } from "../src/lib/session.js";
import { slugify } from "../src/lib/slug.js";

export interface GraphQLResponse<T = Record<string, unknown>> {
  status: number;
  data: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
}

export type { Identity };

export const ALICE: Identity = {
  uid: "ak-alice",
  username: "alice",
  email: "alice@example.com",
};
export const BOB: Identity = { uid: "ak-bob", username: "bob", email: "bob@example.com" };

export async function startApp(): Promise<{ app: Express; stop: () => Promise<void> }> {
  return createApp();
}

/**
 * Empties every table. Called before each test so ordering cannot matter.
 * TRUNCATE ... CASCADE rather than deleteMany so the foreign keys do not
 * dictate the order. Session is listed explicitly rather than left to cascade
 * from User, so a test that creates a session without a user still starts clean.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Session", "Comment", "Review", "Game", "User" CASCADE'
  );
}

/**
 * Signs someone in the way the OIDC callback does: provision the local row from
 * the identity, then issue a session for it. Returns the Cookie header value.
 *
 * The id token is a placeholder — nothing reads it except RP-initiated logout,
 * which hands it straight back to authentik.
 */
export async function sessionFor(identity: Identity): Promise<string> {
  const user = await provisionUser(identity);
  const { token } = await createSession(user.id, `id-token-for-${identity.uid}`);
  return `${SESSION_COOKIE}=${token}`;
}

function post(
  app: Express,
  query: string,
  headers: Record<string, string>,
  variables?: Record<string, unknown>
) {
  const req = request(app).post(GRAPHQL_PATH).set("content-type", "application/json");
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.send(variables ? { query, variables } : { query });
}

/** Calls the API with no session, as an anonymous visitor would. */
export async function publicQuery<T = Record<string, unknown>>(
  app: Express,
  query: string,
  extraHeaders: Record<string, string> = {},
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const res = await post(app, query, extraHeaders, variables);
  return { status: res.status, data: res.body.data ?? null, errors: res.body.errors };
}

/** Calls the API as the given user, or anonymously if omitted. */
export async function authedQuery<T = Record<string, unknown>>(
  app: Express,
  query: string,
  identity?: Identity,
  extraHeaders: Record<string, string> = {},
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const headers = {
    ...(identity ? { Cookie: await sessionFor(identity) } : {}),
    ...extraHeaders,
  };
  const res = await post(app, query, headers, variables);
  return { status: res.status, data: res.body.data ?? null, errors: res.body.errors };
}

export function errorCodes(res: GraphQLResponse): string[] {
  return (res.errors ?? []).map((e) => e.extensions?.code ?? "");
}

/** Creates a game owned by nobody, for tests that need something to review. */
export async function seedGame(title = "Test Game"): Promise<string> {
  const game = await prisma.game.create({ data: { title, slug: slugify(title) } });
  return game.id;
}

/**
 * The playtime fields `createReview` requires.
 *
 * Spliced into the input literal by tests that are about something else, so the
 * part they actually exercise stays legible. A test that is about playtime states
 * its own values instead.
 */
export const PLAYTIME_INPUT = "yearPlayed: 2024, hoursPlayed: 12";
