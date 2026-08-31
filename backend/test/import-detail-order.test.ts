import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { ALICE, authedQuery, resetDatabase, startApp } from "./helpers.js";

/**
 * `importGame` used to fetch the RAWG detail before looking the game up locally.
 * That request exists only to fill in a description, so re-importing a game
 * already stored with one spent a request to build a string that was then thrown
 * away — the common case once a group has been using the site for a while.
 *
 * `fetch` is stubbed rather than hitting RAWG: these tests are about whether a
 * call happens at all, and a suite that spent real quota to prove it saves quota
 * would be self-defeating.
 */

interface FetchStub {
  calls: string[];
  restore: () => void;
}

function stubRawg(): FetchStub {
  const calls: string[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const body = { id: 1, name: "Elden Ring", description_raw: "A game." };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const IMPORT = `mutation Import($input: ImportGameInput!) {
  importGame(input: $input) { id title description }
}`;

const input = { rawgId: "1", title: "Elden Ring" };

describe("importGame detail fetch", () => {
  let app: Express;
  let stop: () => Promise<void>;
  let rawg: FetchStub;

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    process.env["RAWG_API_KEY"] = "test-key";
    rawg = stubRawg();
  });

  afterEach(() => {
    rawg.restore();
    delete process.env["RAWG_API_KEY"];
  });

  const detailCalls = () => rawg.calls.filter((c) => c.includes("/games/1"));

  it("fetches the detail once for a game it has never seen", async () => {
    const res = await authedQuery<{
      importGame: { description: string | null };
    }>(app, IMPORT, ALICE, {}, { input });
    expect(res.errors).toBeUndefined();
    expect(res.data?.importGame.description).toBe("A game.");
    expect(detailCalls()).toHaveLength(1);
  });

  /** The fix: a second import of the same game makes no RAWG call at all. */
  it("makes no RAWG call when the game is already stored with a description", async () => {
    await authedQuery(app, IMPORT, ALICE, {}, { input });
    const before = rawg.calls.length;

    const res = await authedQuery(app, IMPORT, ALICE, {}, { input });
    expect(res.errors).toBeUndefined();
    expect(rawg.calls).toHaveLength(before);
  });

  /** A row stored without one still gets its description backfilled. */
  it("still fetches when the stored game has no description", async () => {
    await prisma.game.create({
      data: {
        rawgId: "1",
        title: "Elden Ring",
        slug: "elden-ring",
        description: null,
      },
    });

    const res = await authedQuery<{
      importGame: { description: string | null };
    }>(app, IMPORT, ALICE, {}, { input });
    expect(res.errors).toBeUndefined();
    expect(res.data?.importGame.description).toBe("A game.");
    expect(detailCalls()).toHaveLength(1);
  });
});
