import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { clearRawgCache } from "../src/lib/rawg.js";
import { ALICE, authedQuery, publicQuery, resetDatabase, startApp } from "./helpers.js";

/**
 * How many requests each path actually makes against RAWG.
 *
 * The quota is 20,000 a month — about 460 a day, or one every three minutes
 * sustained — and the per-IP rate limit of 30/min is two orders of magnitude
 * above that, so it guards the process rather than the budget. What keeps the
 * budget is not making the call.
 *
 * `fetch` is stubbed rather than hitting RAWG: these tests are about the number
 * of calls, and a suite that spent real quota to prove it saves quota would be
 * self-defeating.
 */

interface FetchStub {
  calls: string[];
  restore: () => void;
}

function stubRawg(detail: Record<string, unknown> = {}): FetchStub {
  const calls: string[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const body = url.includes("/games?")
      ? { results: [{ id: 1, name: "Elden Ring", released: "2022-02-25" }] }
      : { id: 1, name: "Elden Ring", description_raw: "A game.", ...detail };
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

const SEARCH = `query Search($q: String!) {
  searchGamesExternal(query: $q) { rawgId title }
}`;

const IMPORT = `mutation Import($input: ImportGameInput!) {
  importGame(input: $input) { id title description }
}`;

describe("RAWG call efficiency", () => {
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
    clearRawgCache();
    process.env["RAWG_API_KEY"] = "test-key";
    rawg = stubRawg();
  });

  afterEach(() => {
    rawg.restore();
    delete process.env["RAWG_API_KEY"];
  });

  describe("search", () => {
    it("calls RAWG once for a query it has not seen", async () => {
      const res = await publicQuery(app, SEARCH, {}, { q: "elden ring" });
      expect(res.errors).toBeUndefined();
      expect(rawg.calls).toHaveLength(1);
    });

    /** The autocomplete's dominant cost: the same query typed again. */
    it("serves a repeated query from cache", async () => {
      await publicQuery(app, SEARCH, {}, { q: "elden ring" });
      await publicQuery(app, SEARCH, {}, { q: "elden ring" });
      await publicQuery(app, SEARCH, {}, { q: "elden ring" });
      expect(rawg.calls).toHaveLength(1);
    });

    it("treats case and stray whitespace as the same query", async () => {
      await publicQuery(app, SEARCH, {}, { q: "Elden Ring" });
      await publicQuery(app, SEARCH, {}, { q: "  elden   ring " });
      expect(rawg.calls).toHaveLength(1);
    });

    it("still calls RAWG for a genuinely different query", async () => {
      await publicQuery(app, SEARCH, {}, { q: "elden ring" });
      await publicQuery(app, SEARCH, {}, { q: "hades" });
      expect(rawg.calls).toHaveLength(2);
    });

    /** An empty query is answered without RAWG being involved at all. */
    it("does not call RAWG for a blank query", async () => {
      const res = await publicQuery(app, SEARCH, {}, { q: "   " });
      expect(res.errors).toBeUndefined();
      expect(rawg.calls).toHaveLength(0);
    });
  });

  describe("import", () => {
    const input = { rawgId: "1", title: "Elden Ring" };

    it("fetches the detail once for a game it has never seen", async () => {
      const res = await authedQuery(app, IMPORT, ALICE, {}, { input });
      expect(res.errors).toBeUndefined();
      expect(rawg.calls.filter((c) => c.includes("/games/1"))).toHaveLength(1);
    });

    /**
     * The regression this issue was opened for: the detail request used to run
     * before the database lookup, so re-importing a game already held with a
     * description spent a request to build a string that was then discarded.
     */
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
        data: { rawgId: "1", title: "Elden Ring", slug: "elden-ring", description: null },
      });

      const res = await authedQuery<{ importGame: { description: string | null } }>(
        app,
        IMPORT,
        ALICE,
        {},
        { input }
      );
      expect(res.errors).toBeUndefined();
      expect(res.data?.importGame.description).toBe("A game.");
      expect(rawg.calls.filter((c) => c.includes("/games/1"))).toHaveLength(1);
    });
  });
});
