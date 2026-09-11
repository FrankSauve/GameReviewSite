import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { PALETTES, THEMES } from "../src/lib/theme.js";
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
  theme: string | null;
  palette: string | null;
}

const UPDATE = `mutation Update($input: UpdateProfileInput!) {
  updateProfile(input: $input) { id theme palette }
}`;

async function setAppearance(
  app: Express,
  input: { theme?: string | null; palette?: string | null },
) {
  return authedQuery<{ updateProfile: UserPayload }>(
    app,
    UPDATE,
    ALICE,
    {},
    { input },
  );
}

describe("the appearance an account has picked", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  it("stores a theme and a palette", async () => {
    const res = await setAppearance(app, {
      theme: "editorial",
      palette: "paper",
    });
    expect(res.errors).toBeUndefined();
    expect(res.data?.updateProfile.theme).toBe("editorial");
    expect(res.data?.updateProfile.palette).toBe("paper");
  });

  it("refuses a theme that has no block to stamp", async () => {
    const res = await setAppearance(app, { theme: "vaporwave" });
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
  });

  it("refuses a palette that has no block to stamp", async () => {
    const res = await setAppearance(app, { palette: "chartreuse" });
    expect(errorCodes(res)).toContain("BAD_USER_INPUT");
  });

  it("normalises case and surrounding space", async () => {
    const res = await setAppearance(app, { theme: "  Brutalist " });
    expect(res.data?.updateProfile.theme).toBe("brutalist");
  });

  /** Cleared and never picked are the same state: back on the default. */
  it("clears the choice on null", async () => {
    await setAppearance(app, { theme: "swiss", palette: "ember" });
    const res = await setAppearance(app, { theme: null, palette: null });
    expect(res.errors).toBeUndefined();
    expect(res.data?.updateProfile.theme).toBeNull();
    expect(res.data?.updateProfile.palette).toBeNull();
  });

  /** The two axes are independent, so setting one must not disturb the other. */
  it("leaves the palette alone when only the theme is sent", async () => {
    await setAppearance(app, { theme: "swiss", palette: "ember" });
    const res = await setAppearance(app, { theme: "hud" });
    expect(res.data?.updateProfile.theme).toBe("hud");
    expect(res.data?.updateProfile.palette).toBe("ember");
  });

  it("leaves both alone when the input omits them", async () => {
    await setAppearance(app, { theme: "swiss", palette: "ember" });
    const res = await authedQuery<{ updateProfile: UserPayload }>(
      app,
      UPDATE,
      ALICE,
      {},
      { input: { bio: "hello" } },
    );
    expect(res.data?.updateProfile.theme).toBe("swiss");
    expect(res.data?.updateProfile.palette).toBe("ember");
  });

  it("starts null, so a new account is on the default", async () => {
    await setAppearance(app, {});
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: ALICE.username },
    });
    expect(user.theme).toBeNull();
    expect(user.palette).toBeNull();
  });

  /**
   * A viewer preference, not profile content: it is read back through `me`,
   * never from someone else's profile.
   */
  it("is not exposed on the public user list", async () => {
    await setAppearance(app, { theme: "swiss" });
    const res = await publicQuery<{ users: UserPayload[] }>(
      app,
      `query { users { id theme palette } }`,
    );
    expect(res.data?.users.map((u) => u.theme)).not.toContain("swiss");
  });

  it("offers both axes to the picker", () => {
    expect(THEMES.length).toBe(4);
    expect(PALETTES.length).toBe(3);
  });
});
