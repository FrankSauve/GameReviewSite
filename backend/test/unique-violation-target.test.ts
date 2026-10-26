import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import {
  uniqueViolationTargets,
  violatesUniqueOn,
} from "../src/lib/uniqueViolation.js";

/**
 * Against the real driver adapter, not a hand-built error: where Prisma puts the
 * colliding constraint is exactly what changed between majors.
 */
describe("a unique-constraint violation", () => {
  beforeEach(resetDatabase);

  async function violation(write: () => Promise<unknown>): Promise<unknown> {
    try {
      await write();
    } catch (err) {
      return err;
    }
    throw new Error("expected the write to violate a unique constraint");
  }

  it("names the field it collided on, and only that one", async () => {
    await prisma.game.create({
      data: { title: "Hades", slug: "hades", rawgId: "1" },
    });
    const err = await violation(() =>
      prisma.game.create({
        data: { title: "Hades", slug: "hades-2", rawgId: "1" },
      }),
    );

    expect(violatesUniqueOn(err, "rawgId")).toBe(true);
    expect(violatesUniqueOn(err, "slug")).toBe(false);
  });

  it("tells apart two unique fields on the same table", async () => {
    await prisma.user.create({
      data: { username: "alice", slug: "alice", email: "a@example.com" },
    });
    const err = await violation(() =>
      prisma.user.create({
        data: { username: "alice2", slug: "alice2", email: "a@example.com" },
      }),
    );

    expect(violatesUniqueOn(err, "email")).toBe(true);
    expect(violatesUniqueOn(err, "username")).toBe(false);
  });

  it("is not reported for any other error", () => {
    expect(uniqueViolationTargets(new Error("connection reset"))).toBeNull();
  });
});
