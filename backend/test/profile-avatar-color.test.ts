import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { AVATAR_COLORS } from "../src/lib/avatarColor.js";
import {
  ALICE,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  startApp,
} from "./helpers.js";

interface UserPayload {
  id: string;
  avatarColor: string | null;
}

const UPDATE = `mutation Update($input: UpdateProfileInput!) {
  updateProfile(input: $input) { id avatarColor }
}`;

async function setColor(app: Express, avatarColor: string | null) {
  return authedQuery<{ updateProfile: UserPayload }>(
    app,
    UPDATE,
    ALICE,
    {},
    { input: { avatarColor } },
  );
}

describe("profile avatar colour", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("stores a colour from the palette", async () => {
    const res = await setColor(app, "teal");
    expect(res.errors).toBeUndefined();
    expect(res.data?.updateProfile.avatarColor).toBe("teal");
  });

  it("refuses a colour outside the palette", async () => {
    const res = await setColor(app, "puce");
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
  });

  /** Cleared and never picked are the same state: back on the slug fallback. */
  it("clears the choice on null", async () => {
    await setColor(app, "teal");
    const res = await setColor(app, null);
    expect(res.errors).toBeUndefined();
    expect(res.data?.updateProfile.avatarColor).toBeNull();
  });

  it("leaves the colour alone when the input omits it", async () => {
    await setColor(app, "teal");
    const res = await authedQuery<{ updateProfile: UserPayload }>(
      app,
      UPDATE,
      ALICE,
      {},
      { input: { bio: "hello" } },
    );
    expect(res.data?.updateProfile.avatarColor).toBe("teal");
  });

  it("starts null, so a new account is on the fallback", async () => {
    const res = await setColor(app, null);
    expect(res.errors).toBeUndefined();
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: ALICE.username },
    });
    expect(user.avatarColor).toBeNull();
  });

  /** Public: every page draws other people's avatars. */
  it("is readable by anyone", async () => {
    await setColor(app, "rose");
    const res = await publicQuery<{ users: UserPayload[] }>(
      app,
      `query { users { id avatarColor } }`,
    );
    expect(res.data?.users.map((u) => u.avatarColor)).toContain("rose");
  });

  it("offers a palette the picker can lay out", () => {
    expect(AVATAR_COLORS.length).toBe(12);
  });
});
