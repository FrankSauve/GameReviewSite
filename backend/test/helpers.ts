import request from "supertest";
import type { Express } from "express";
import { AUTHENTICATED_PATH, PUBLIC_PATH, createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

export const PROXY_SECRET = "test-proxy-secret";

export interface GraphQLResponse<T = Record<string, unknown>> {
  status: number;
  data: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
}

/** An identity as the authentik outpost would assert it. */
export interface Identity {
  uid: string;
  username: string;
  email?: string;
}

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
 * dictate the order.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Comment", "Review", "Game", "User" CASCADE'
  );
}

function post(
  app: Express,
  path: string,
  query: string,
  headers: Record<string, string>,
  variables?: Record<string, unknown>
) {
  const req = request(app).post(path).set("content-type", "application/json");
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.send(variables ? { query, variables } : { query });
}

function identityHeaders(identity: Identity): Record<string, string> {
  return {
    "x-proxy-secret": PROXY_SECRET,
    "x-authentik-uid": identity.uid,
    "x-authentik-username": identity.username,
    ...(identity.email ? { "x-authentik-email": identity.email } : {}),
  };
}

/** Calls the public endpoint, which is never authenticated. */
export async function publicQuery<T = Record<string, unknown>>(
  app: Express,
  query: string,
  extraHeaders: Record<string, string> = {},
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const res = await post(app, PUBLIC_PATH, query, extraHeaders, variables);
  return { status: res.status, data: res.body.data ?? null, errors: res.body.errors };
}

/** Calls the guarded endpoint as the given user, or anonymously if omitted. */
export async function authedQuery<T = Record<string, unknown>>(
  app: Express,
  query: string,
  identity?: Identity,
  extraHeaders: Record<string, string> = {},
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const headers = { ...(identity ? identityHeaders(identity) : {}), ...extraHeaders };
  const res = await post(app, AUTHENTICATED_PATH, query, headers, variables);
  return { status: res.status, data: res.body.data ?? null, errors: res.body.errors };
}

export function errorCodes(res: GraphQLResponse): string[] {
  return (res.errors ?? []).map((e) => e.extensions?.code ?? "");
}

/** Creates a game owned by nobody, for tests that need something to review. */
export async function seedGame(title = "Test Game"): Promise<string> {
  const game = await prisma.game.create({ data: { title } });
  return game.id;
}
