import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failureReason, isOutage } from "../src/lib/coverRefresh.js";
import { sourceUnavailable } from "../src/lib/gameSources/http.js";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("why a source lookup failed", () => {
  it("keeps the reader's message, and the cause apart from it", () => {
    const err = sourceUnavailable("TheGamesDB", "TGDB_API_KEY is not set");
    expect(err.message).toBe(
      "TheGamesDB is unavailable right now. Try again shortly.",
    );
    expect(err.extensions["code"]).toBe("SERVICE_UNAVAILABLE");
    expect(failureReason(err)).toBe("TGDB_API_KEY is not set");
  });

  it("names a status as HTTP, and keeps a network error's code", () => {
    expect(failureReason(sourceUnavailable("Steam", 403))).toBe("HTTP 403");
    const fetchFailed = new TypeError("fetch failed", {
      cause: Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" }),
    });
    expect(failureReason(sourceUnavailable("Steam", fetchFailed))).toBe(
      "fetch failed (ENOTFOUND)",
    );
  });

  it("describes a reason that is neither text nor an Error", () => {
    expect(failureReason(sourceUnavailable("Steam", { status: "odd" }))).toBe(
      '{"status":"odd"}',
    );
  });

  it("gives any other error's own message", () => {
    expect(failureReason(new Error("Steam API returned 400"))).toBe(
      "Steam API returned 400",
    );
  });
});

describe("which failures count against a source", () => {
  it("counts an outage, not a failure about one id", () => {
    expect(isOutage(sourceUnavailable("Steam", 429))).toBe(true);
    expect(isOutage(new Error("TheGamesDB API returned 400"))).toBe(false);
  });
});
