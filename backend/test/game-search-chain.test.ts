import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameSearch, type Lookup } from "../src/lib/gameSearch.js";
import { GraphQLError } from "graphql";

const hit = (title: string) => ({
  externalId: "1",
  title,
  coverUrl: null,
  releaseYear: null,
  genres: [],
  metacritic: null,
});

function source(name: "STEAM" | "TGDB" | "RAWG", title: string = name) {
  const search = vi.fn<Lookup["search"]>(async () => [hit(title)]);
  return { name, source: name, search } satisfies Lookup;
}

const down = (lookup: { search: ReturnType<typeof vi.fn> }) =>
  lookup.search.mockRejectedValue(new Error("down"));

describe("searching across game sources", () => {
  let clock: number;
  let steam: ReturnType<typeof source>;
  let tgdb: ReturnType<typeof source>;
  let rawg: ReturnType<typeof source>;
  let dlc: ReturnType<typeof source>;
  let chain: ReturnType<typeof createGameSearch>;

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    clock = 1_000_000;
    steam = source("STEAM");
    tgdb = source("TGDB");
    rawg = source("RAWG");
    dlc = { ...source("STEAM", "Expansion"), name: "STEAM_DLC" as "STEAM" };
    chain = createGameSearch(
      {
        DEFAULT: { fallback: [steam, tgdb, rawg] },
        EVERYWHERE: {
          fallback: [tgdb, rawg],
          emptyFallsThrough: true,
          extra: [dlc],
        },
      },
      () => clock,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  const titles = async (scope: "DEFAULT" | "EVERYWHERE", query = "halo") =>
    (await chain.search(query, scope)).map((found) => found.title);

  it("asks only Steam when Steam answers", async () => {
    expect(await titles("DEFAULT")).toEqual(["STEAM"]);
    expect(tgdb.search).not.toHaveBeenCalled();
  });

  it("takes an empty answer as an answer, not a failure", async () => {
    steam.search.mockResolvedValue([]);
    expect(await titles("DEFAULT")).toEqual([]);
    expect(tgdb.search).not.toHaveBeenCalled();
  });

  it("falls through Steam to TheGamesDB to RAWG as each fails", async () => {
    down(steam);
    expect(await titles("DEFAULT", "a")).toEqual(["TGDB"]);
    down(tgdb);
    expect(await titles("DEFAULT", "b")).toEqual(["RAWG"]);
  });

  it("names the source of each hit", async () => {
    down(steam);
    expect((await chain.search("a", "DEFAULT"))[0]?.source).toBe("TGDB");
  });

  it("reports an outage when nothing answers", async () => {
    down(steam);
    down(tgdb);
    down(rawg);
    const err = await chain.search("a", "DEFAULT").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect((err as GraphQLError).extensions["code"]).toBe(
      "SERVICE_UNAVAILABLE",
    );
    expect((err as GraphQLError).message).toBe(
      "Game search is unavailable right now. Try again shortly.",
    );
  });

  it("does not wait on a failed source again for a minute", async () => {
    down(steam);
    await chain.search("a", "DEFAULT");
    await chain.search("b", "DEFAULT");
    expect(steam.search).toHaveBeenCalledTimes(1);
    clock += 60_001;
    await chain.search("c", "DEFAULT");
    expect(steam.search).toHaveBeenCalledTimes(2);
  });

  it("skips a source that says it is off", async () => {
    const off = { ...tgdb, enabled: () => false };
    const search = createGameSearch({
      DEFAULT: { fallback: [off, rawg] },
      EVERYWHERE: { fallback: [] },
    });
    expect((await search.search("a", "DEFAULT"))[0]?.title).toBe("RAWG");
    expect(tgdb.search).not.toHaveBeenCalled();
  });

  it("answers a repeated query from memory, ignoring case, for an hour", async () => {
    await chain.search("Halo", "DEFAULT");
    await chain.search("halo", "DEFAULT");
    expect(steam.search).toHaveBeenCalledTimes(1);
    clock += 60 * 60 * 1000 + 1;
    await chain.search("halo", "DEFAULT");
    expect(steam.search).toHaveBeenCalledTimes(2);
  });

  it("searches everywhere without Steam's games, adding its DLC", async () => {
    expect(await titles("EVERYWHERE")).toEqual(["TGDB", "Expansion"]);
    expect(steam.search).not.toHaveBeenCalled();
    expect(rawg.search).not.toHaveBeenCalled();
  });

  it("asks RAWG when TheGamesDB has nothing, if the reader asked to look further", async () => {
    tgdb.search.mockResolvedValue([]);
    expect(await titles("EVERYWHERE")).toEqual(["RAWG", "Expansion"]);
  });

  it("still answers with nothing when RAWG then fails", async () => {
    tgdb.search.mockResolvedValue([]);
    down(rawg);
    expect(await titles("EVERYWHERE")).toEqual(["Expansion"]);
  });

  it("survives losing either half of searching everywhere", async () => {
    down(dlc);
    expect(await titles("EVERYWHERE", "a")).toEqual(["TGDB"]);
    down(tgdb);
    expect(await titles("EVERYWHERE", "b")).toEqual(["RAWG"]);
  });
});
