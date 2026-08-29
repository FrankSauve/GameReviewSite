import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { BIO_MAX } from "../src/resolvers/user.js";
import {
  ALICE,
  BOB,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  startApp,
} from "./helpers.js";

interface UserPayload {
  id: string;
  username: string;
  bio: string | null;
}

const UPDATE = `mutation Update($input: UpdateProfileInput!) {
  updateProfile(input: $input) { id bio }
}`;

/**
 * The account's UUID.
 *
 * Profiles are looked up by id on this branch. Readable URLs (#44) let `user`
 * take a username too, but that is a separate change and this file should not
 * quietly depend on whether it has landed yet.
 */
async function idOf(username: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  return user.id;
}

async function setBio(app: Express, identity: typeof ALICE, bio: string | null) {
  return authedQuery<{ updateProfile: UserPayload }>(
    app,
    UPDATE,
    identity,
    {},
    { input: { bio } }
  );
}

describe("profile bio", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("stores a bio for the signed-in account", async () => {
    const res = await setBio(app, ALICE, "I score on a curve.");
    expect(res.errors).toBeUndefined();
    expect(res.data?.updateProfile.bio).toBe("I score on a curve.");
  });

  it("shows it on the public profile", async () => {
    await setBio(app, ALICE, "I score on a curve.");
    const res = await publicQuery<{ user: UserPayload | null }>(
      app,
      `{ user(id: "${await idOf(ALICE.username)}") { bio } }`
    );
    expect(res.data?.user?.bio).toBe("I score on a curve.");
  });

  it("starts empty", async () => {
    await setBio(app, ALICE, "anything");
    const aliceId = await idOf(ALICE.username);
    await prisma.user.update({ where: { id: aliceId }, data: { bio: null } });

    const res = await publicQuery<{ user: UserPayload | null }>(
      app,
      `{ user(id: "${aliceId}") { bio } }`
    );
    expect(res.data?.user?.bio).toBeNull();
  });

  it("replaces the bio rather than appending to it", async () => {
    await setBio(app, ALICE, "first");
    const res = await setBio(app, ALICE, "second");
    expect(res.data?.updateProfile.bio).toBe("second");
  });

  /**
   * Cleared and never written are the same state, so both read as absent rather
   * than one of them rendering as an empty paragraph.
   */
  it("stores an emptied bio as null", async () => {
    await setBio(app, ALICE, "something");
    const res = await setBio(app, ALICE, "   ");
    expect(res.data?.updateProfile.bio).toBeNull();
  });

  it("trims surrounding whitespace", async () => {
    const res = await setBio(app, ALICE, "  padded  ");
    expect(res.data?.updateProfile.bio).toBe("padded");
  });

  describe("who may write one", () => {
    it("refuses an anonymous caller", async () => {
      const res = await publicQuery(app, UPDATE, {}, { input: { bio: "hello" } });
      expect(errorCodes(res)).toContain("UNAUTHENTICATED");
    });

    /**
     * The mutation takes no id at all, so there is no "somebody else's profile"
     * to aim it at. This pins that: Bob writing a bio touches Bob's row only.
     */
    it("only ever writes the caller's own profile", async () => {
      await setBio(app, ALICE, "alice's bio");
      await setBio(app, BOB, "bob's bio");

      const res = await publicQuery<{ user: UserPayload | null }>(
        app,
        `{ user(id: "${await idOf(ALICE.username)}") { bio } }`
      );
      expect(res.data?.user?.bio).toBe("alice's bio");
    });
  });

  describe("length", () => {
    it("accepts a bio at the limit", async () => {
      const res = await setBio(app, ALICE, "x".repeat(BIO_MAX));
      expect(res.errors).toBeUndefined();
      expect(res.data?.updateProfile.bio).toHaveLength(BIO_MAX);
    });

    it("refuses one over it", async () => {
      const res = await setBio(app, ALICE, "x".repeat(BIO_MAX + 1));
      expect(res.errors?.[0]?.message).toMatch(/at most/);
    });

    /** The cap is on what is stored, so padding does not count against it. */
    it("measures after trimming", async () => {
      const res = await setBio(app, ALICE, "  " + "x".repeat(BIO_MAX) + "  ");
      expect(res.errors).toBeUndefined();
    });
  });

  /**
   * A bio is Markdown, and the renderer escapes rather than parses raw HTML, so
   * this only has to check that the server stores what it was given without
   * trying to be clever about it.
   */
  it("stores markdown verbatim", async () => {
    const markdown = "**bold**, a [link](https://example.com) and ||a spoiler||";
    const res = await setBio(app, ALICE, markdown);
    expect(res.data?.updateProfile.bio).toBe(markdown);
  });
});
