import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tgdbFanart } from "../src/lib/gameSources/tgdb.js";

/** Trimmed from a real response, so the shape here is TheGamesDB's, not a guess. */
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`./fixtures/gameSources/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

const answer = (body: unknown) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => new Response(JSON.stringify(body)));

describe("TheGamesDB's fan art", () => {
  beforeEach(() => {
    vi.stubEnv("TGDB_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is the first fan art uploaded, and none where there is none", async () => {
    answer(fixture("tgdb-images"));
    const fanart = await tgdbFanart(["70", "7752", "29221"]);
    expect(fanart.get("70")).toBe(
      "https://cdn.thegamesdb.net/images/large/fanart/70-1.jpg",
    );
    expect(fanart.get("7752")).toBe(
      "https://cdn.thegamesdb.net/images/large/fanart/7752-1.jpg",
    );
    expect(fanart.has("29221")).toBe(false);
  });

  it.each([
    ["http://cdn.thegamesdb.net/images/large/", "not https"],
    ["https://evil.example/images/large/", "off TheGamesDB's host"],
  ])("drops fan art served from %s (%s)", async (base) => {
    const body = fixture("tgdb-images") as {
      data: { base_url: { large: string } };
    };
    answer({ ...body, data: { ...body.data, base_url: { large: base } } });
    expect((await tgdbFanart(["70"])).has("70")).toBe(false);
  });
});
