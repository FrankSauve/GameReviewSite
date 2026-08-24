import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import {
  ALICE,
  BOB,
  authedQuery,
  publicQuery,
  resetDatabase,
  startApp,
} from "./helpers";

/**
 * The public `users` and `user(id)` queries used to return every account's
 * email address to anonymous callers.
 */
describe("email privacy", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  async function provision(): Promise<string> {
    const res = await authedQuery<{ me: { id: string } }>(
      app,
      "{ me { id } }",
      ALICE
    );
    return res.data!.me.id;
  }

  it("hides email from the anonymous users list", async () => {
    await provision();
    const res = await publicQuery<{ users: { username: string; email: null }[] }>(
      app,
      "{ users { username email } }"
    );
    expect(res.data?.users).toHaveLength(1);
    expect(res.data?.users[0]?.email).toBeNull();
    expect(res.data?.users[0]?.username).toBe("alice");
  });

  it("hides email from an anonymous profile lookup", async () => {
    const id = await provision();
    const res = await publicQuery<{ user: { email: null } }>(
      app,
      `{ user(id: "${id}") { username email } }`
    );
    expect(res.data?.user.email).toBeNull();
  });

  it("hides another signed-in user's email", async () => {
    const aliceId = await provision();
    const res = await authedQuery<{ user: { email: null } }>(
      app,
      `{ user(id: "${aliceId}") { username email } }`,
      BOB
    );
    expect(res.data?.user.email).toBeNull();
  });

  it("shows the owner their own email", async () => {
    const aliceId = await provision();
    const res = await authedQuery<{ user: { email: string } }>(
      app,
      `{ user(id: "${aliceId}") { email } }`,
      ALICE
    );
    expect(res.data?.user.email).toBe("alice@example.com");
  });

  it("exposes no mutation that could rename or re-email an account", async () => {
    // authentik owns username and email; updateUser was removed so a local
    // edit cannot silently diverge from the identity provider.
    const res = await authedQuery(
      app,
      'mutation { updateUser(input: { username: "renamed" }) { id } }',
      ALICE
    );
    expect(res.errors?.[0]?.message).toMatch(/Cannot query field "updateUser"/);
  });
});
