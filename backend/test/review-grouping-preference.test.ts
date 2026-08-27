import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Express } from "express";
import {
  ALICE,
  BOB,
  authedQuery,
  errorCodes,
  publicQuery,
  resetDatabase,
  sessionFor,
  startApp,
} from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";

/**
 * Which grouping a profile opens on, chosen by the profile's owner.
 *
 * This is the first mutation that writes a User row, against a resolver file that
 * deliberately had no `updateUser`. The reason it is admissible: that argument was
 * about authentik owning username and email, so a local edit to either is
 * overwritten at the next login. This field is local-only, so these tests pin both
 * that it works and that it cannot reach anyone else's row.
 */
describe("default review grouping", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(resetDatabase);

  const setGrouping = (grouping: string, as = ALICE) =>
    authedQuery(
      app,
      `mutation { setReviewGrouping(grouping: ${grouping}) { id username defaultReviewGrouping } }`,
      as
    );

  it("defaults to YEAR for a newly provisioned account", async () => {
    await sessionFor(ALICE);
    const res = await authedQuery(
      app,
      "{ me { defaultReviewGrouping } }",
      ALICE
    );
    expect(res.data?.me).toMatchObject({ defaultReviewGrouping: "YEAR" });
  });

  it("is readable by a visitor, who needs it to know which view to render", async () => {
    await sessionFor(ALICE);
    const alice = await prisma.user.findFirstOrThrow();
    const res = await publicQuery(
      app,
      `{ user(id: "${alice.id}") { defaultReviewGrouping } }`
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.user).toMatchObject({ defaultReviewGrouping: "YEAR" });
  });

  it.each(["SCORE", "RECENT", "YEAR"])("stores %s", async (grouping) => {
    const res = await setGrouping(grouping);
    expect(res.errors).toBeUndefined();
    expect(res.data?.setReviewGrouping).toMatchObject({
      defaultReviewGrouping: grouping,
    });

    const stored = await prisma.user.findFirstOrThrow({
      where: { authentikUid: ALICE.uid },
    });
    expect(stored.defaultReviewGrouping).toBe(grouping);
  });

  it("survives being set twice", async () => {
    await setGrouping("SCORE");
    const res = await setGrouping("RECENT");
    expect(res.data?.setReviewGrouping).toMatchObject({
      defaultReviewGrouping: "RECENT",
    });
  });

  it("refuses a grouping outside the enum", async () => {
    const res = await setGrouping("SIDEWAYS");
    expect(res.errors?.[0]?.message).toBeDefined();
  });

  describe("cannot reach another account", () => {
    it("refuses an anonymous caller", async () => {
      const res = await authedQuery(
        app,
        "mutation { setReviewGrouping(grouping: SCORE) { id } }"
      );
      expect(errorCodes(res)).toContain("UNAUTHENTICATED");
    });

    /**
     * The mutation takes no user id, so this is the strongest form of the
     * assertion available: there is no argument through which one account could
     * name another. If a userId argument is ever added, this stops compiling as a
     * valid query and the test fails rather than passing quietly.
     */
    it("has no argument for naming a user", async () => {
      const alice = await sessionFor(ALICE);
      expect(alice).toBeDefined();
      const target = await prisma.user.findFirstOrThrow();
      const res = await authedQuery(
        app,
        `mutation { setReviewGrouping(grouping: SCORE, userId: "${target.id}") { id } }`,
        BOB
      );
      expect(res.errors?.[0]?.message).toMatch(/userId/i);
    });

    it("writes only the caller's row when two accounts exist", async () => {
      await setGrouping("SCORE", ALICE);
      await setGrouping("RECENT", BOB);

      const alice = await prisma.user.findFirstOrThrow({
        where: { authentikUid: ALICE.uid },
      });
      const bob = await prisma.user.findFirstOrThrow({
        where: { authentikUid: BOB.uid },
      });
      expect(alice.defaultReviewGrouping).toBe("SCORE");
      expect(bob.defaultReviewGrouping).toBe("RECENT");
    });

    it("leaves the other account alone entirely", async () => {
      await sessionFor(BOB);
      const before = await prisma.user.findFirstOrThrow({
        where: { authentikUid: BOB.uid },
      });

      await setGrouping("SCORE", ALICE);

      const after = await prisma.user.findFirstOrThrow({
        where: { authentikUid: BOB.uid },
      });
      expect(after.defaultReviewGrouping).toBe(before.defaultReviewGrouping);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    });
  });

  /** Setting a preference must not become a way to edit the fields authentik owns. */
  it("does not let username or email be written alongside it", async () => {
    const res = await authedQuery(
      app,
      'mutation { setReviewGrouping(grouping: SCORE, username: "hijack") { id } }',
      ALICE
    );
    expect(res.errors?.[0]?.message).toMatch(/username/i);
  });
});
