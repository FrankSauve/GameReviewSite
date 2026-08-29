import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { ALICE, authedQuery, resetDatabase, startApp } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

/** Local rows are created from the authentik identity on first sight. */
describe("user provisioning", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  const me = (identity: Parameters<typeof authedQuery>[2]) =>
    authedQuery<{ me: { id: string; username: string; email: string | null } }>(
      app,
      "{ me { id username email } }",
      identity
    );

  it("creates a row on first request", async () => {
    const res = await me(ALICE);
    expect(res.data?.me.username).toBe("alice");
    expect(await prisma.user.count()).toBe(1);
  });

  it("is idempotent — repeated requests reuse the same row", async () => {
    const first = await me(ALICE);
    const second = await me(ALICE);
    expect(second.data?.me.id).toBe(first.data?.me.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it("follows a rename in authentik without changing the local id", async () => {
    const before = await me(ALICE);
    const after = await me({ ...ALICE, username: "alice-renamed" });

    expect(after.data?.me.id).toBe(before.data?.me.id);
    expect(after.data?.me.username).toBe("alice-renamed");
    expect(await prisma.user.count()).toBe(1);
  });

  it("adopts a pre-authentik row with the same email, keeping its reviews", async () => {
    const legacy = await prisma.user.create({
      data: { username: "old-alice", email: "alice@example.com" },
    });
    const game = await prisma.game.create({
      data: { title: "Legacy Game", slug: "legacy-game" },
    });
    await prisma.review.create({
      data: {
        slug: "legacy-game-by-old-alice",
        userId: legacy.id,
        gameId: game.id,
        rating: 7,
        content: "From before",
      },
    });

    const res = await me(ALICE);

    expect(res.data?.me.id).toBe(legacy.id);
    expect(res.data?.me.username).toBe("alice");
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.review.count({ where: { userId: legacy.id } })).toBe(1);
  });

  it("still signs in when the email is held by a different authentik user", async () => {
    // Most likely cause: an authentik account was deleted and recreated, so the
    // old local row still holds the address under a stale uid.
    await prisma.user.create({
      data: {
        authentikUid: "ak-someone-else",
        username: "claimed",
        email: "alice@example.com",
      },
    });

    const res = await me(ALICE);

    // A new row rather than an error, giving way on the field that collided.
    expect(res.data?.me.username).toBe("alice");
    expect(res.data?.me.email).toBeNull();
    expect(await prisma.user.count()).toBe(2);
  });

  it("gives way on both fields when username and email are both taken", async () => {
    await prisma.user.create({
      data: {
        authentikUid: "ak-stale",
        username: "alice",
        email: "alice@example.com",
      },
    });

    const res = await me(ALICE);

    expect(res.data?.me.username).toBe("alice-ak-ali");
    expect(res.data?.me.email).toBeNull();
    expect(await prisma.user.count()).toBe(2);
  });

  it("disambiguates a username already held by an unrelated account", async () => {
    await prisma.user.create({
      data: { username: "alice", email: "different@example.com" },
    });

    const res = await me({ ...ALICE, email: "alice@example.com" });

    expect(res.data?.me.username).toBe("alice-ak-ali");
    expect(await prisma.user.count()).toBe(2);
  });

  it("provisions a user with no email at all", async () => {
    const res = await me({ uid: "ak-noemail", username: "nomail", email: null });
    expect(res.data?.me.email).toBeNull();
    expect(await prisma.user.count()).toBe(1);
  });
});
