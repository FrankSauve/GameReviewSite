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
import { sanitizeError } from "../src/lib/sanitizeError.js";
import { errorCodes, publicQuery, startApp } from "./helpers.js";

const SEARCH = '{ searchGamesExternal(query: "halo") { rawgId } }';
const PREVIEW = '{ rawgGame(rawgId: "1") { rawgId } }';
const OUTAGE_MESSAGE = "RAWG is unavailable right now. Try again shortly.";

describe("when RAWG is down", () => {
  let app: Express;
  let stop: () => Promise<void>;
  const original = globalThis.fetch;
  const fetchStub = vi.fn<typeof globalThis.fetch>();

  beforeAll(async () => {
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(() => {
    process.env["RAWG_API_KEY"] = "secret-key";
    globalThis.fetch = fetchStub;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    globalThis.fetch = original;
    delete process.env["RAWG_API_KEY"];
    fetchStub.mockReset();
    vi.restoreAllMocks();
  });

  const respondWith = (status: number) =>
    fetchStub.mockResolvedValue(new Response("{}", { status }));

  it.each([500, 502, 503, 504, 429])(
    "tells the reader so on a %i",
    async (status) => {
      respondWith(status);
      const res = await publicQuery(app, SEARCH);
      expect(errorCodes(res)).toEqual(["SERVICE_UNAVAILABLE"]);
      expect(res.errors?.[0]?.message).toBe(OUTAGE_MESSAGE);
    },
  );

  it("tells the reader so when the connection fails", async () => {
    fetchStub.mockRejectedValue(new TypeError("fetch failed"));
    const res = await publicQuery(app, PREVIEW);
    expect(errorCodes(res)).toEqual(["SERVICE_UNAVAILABLE"]);
  });

  it("tells the reader so when the request times out", async () => {
    fetchStub.mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError"),
    );
    const res = await publicQuery(app, SEARCH);
    expect(errorCodes(res)).toEqual(["SERVICE_UNAVAILABLE"]);
  });

  it("tells the reader so when a 200 is not JSON", async () => {
    fetchStub.mockResolvedValue(new Response("<html>maintenance</html>"));
    const res = await publicQuery(app, SEARCH);
    expect(errorCodes(res)).toEqual(["SERVICE_UNAVAILABLE"]);
  });

  it("puts a deadline on every call", async () => {
    respondWith(200);
    await publicQuery(app, SEARCH);
    await publicQuery(app, PREVIEW);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchStub.mock.calls)
      expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a refused key as our failure, not an outage", async () => {
    respondWith(401);
    const res = await publicQuery(app, SEARCH);
    expect(errorCodes(res)).not.toContain("SERVICE_UNAVAILABLE");
  });

  it("logs the outage without the key", async () => {
    fetchStub.mockRejectedValue(new TypeError("fetch failed"));
    await publicQuery(app, SEARCH);
    expect(console.warn).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "secret-key",
    );
  });

  it("keeps its message in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const sanitized = sanitizeError({
      message: OUTAGE_MESSAGE,
      extensions: { code: "SERVICE_UNAVAILABLE" },
    });
    vi.unstubAllEnvs();
    expect(sanitized.message).toBe(OUTAGE_MESSAGE);
  });
});
