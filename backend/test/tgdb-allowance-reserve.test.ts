import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tgdbSource } from "../src/lib/gameSources/tgdb.js";

const answer = (body: unknown) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => new Response(JSON.stringify(body)));

describe("TheGamesDB's allowance reserve", () => {
  beforeEach(() => {
    process.env["TGDB_API_KEY"] = "secret-key";
  });
  afterEach(() => {
    delete process.env["TGDB_API_KEY"];
    vi.restoreAllMocks();
  });

  it("is off without a key", () => {
    delete process.env["TGDB_API_KEY"];
    expect(tgdbSource.enabled?.()).toBe(false);
  });

  it("reports a saved link as unavailable without a key, not as our failure", async () => {
    delete process.env["TGDB_API_KEY"];
    await expect(tgdbSource.detail("1")).rejects.toMatchObject({
      extensions: { code: "SERVICE_UNAVAILABLE" },
    });
  });

  it("counts extra allowance as allowance", async () => {
    answer({
      data: { games: [] },
      remaining_monthly_allowance: 10,
      extra_allowance: 500,
      allowance_refresh_timer: 60,
    });
    await tgdbSource.search("x");
    expect(tgdbSource.enabled?.()).toBe(true);
  });

  it("stops being offered once the allowance runs low, until it refreshes", async () => {
    vi.useFakeTimers();
    answer({
      data: { games: [] },
      remaining_monthly_allowance: 49,
      allowance_refresh_timer: 60,
    });
    await tgdbSource.search("x");
    expect(tgdbSource.enabled?.()).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(tgdbSource.enabled?.()).toBe(true);
    vi.useRealTimers();
  });
});
