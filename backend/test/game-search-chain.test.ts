import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withArt } from "../src/lib/gameSources/art.js";
import { createGameSearch, type Lookup } from "../src/lib/gameSearch.js";
import { GraphQLError } from "graphql";
import type { GameSource } from "../src/lib/gameSources/types.js";

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
  let third: ReturnType<typeof source>;
  let dlc: ReturnType<typeof source>;
  let chain: ReturnType<typeof createGameSearch>;

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    clock = 1_000_000;
    steam = source("STEAM");
    tgdb = source("TGDB");
    // Any third id: the chain does not know which sources production plans.
    third = source("RAWG", "THIRD");
    dlc = { ...source("STEAM", "Expansion"), name: "STEAM_DLC" as "STEAM" };
    chain = createGameSearch(
      {
        DEFAULT: { fallback: [steam, tgdb, third] },
        EVERYWHERE: {
          lead: [steam],
          fallback: [tgdb, third],
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

  it("falls through each source in turn as each fails", async () => {
    down(steam);
    expect(await titles("DEFAULT", "a")).toEqual(["TGDB"]);
    down(tgdb);
    expect(await titles("DEFAULT", "b")).toEqual(["THIRD"]);
  });

  it("names the source of each hit", async () => {
    down(steam);
    expect((await chain.search("a", "DEFAULT"))[0]?.source).toBe("TGDB");
  });

  it("reports an outage when nothing answers", async () => {
    down(steam);
    down(tgdb);
    down(third);
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
      DEFAULT: { fallback: [off, third] },
      EVERYWHERE: { fallback: [] },
    });
    expect((await search.search("a", "DEFAULT"))[0]?.title).toBe("THIRD");
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

  it("reads a game's detail once per pick, and does not keep a miss", async () => {
    const detail = vi.fn<GameSource["detail"]>(async () => ({
      title: "Game",
      coverUrl: null,
      posterUrl: null,
      bannerUrl: null,
      genres: [],
      releaseYear: null,
      description: null,
    }));
    const game = { id: "TGDB", search: async () => [], detail } as GameSource;
    await chain.detail(game, "1");
    await chain.detail(game, "1");
    expect(detail).toHaveBeenCalledTimes(1);

    detail.mockResolvedValue(null);
    await chain.detail(game, "2");
    await chain.detail(game, "2");
    expect(detail).toHaveBeenCalledTimes(3);
  });

  it("asks again soon, not at once, for a game whose art lookup was down", async () => {
    const detail = vi.fn<GameSource["detail"]>(async () =>
      withArt(
        {
          title: "Game",
          coverUrl: null,
          posterUrl: null,
          bannerUrl: null,
          genres: [],
          releaseYear: null,
          description: null,
        },
        true,
      ),
    );
    const game = { id: "STEAM", search: async () => [], detail } as GameSource;
    await chain.detail(game, "1");
    await chain.detail(game, "1");
    expect(detail).toHaveBeenCalledTimes(1);
    clock += 61_000;
    await chain.detail(game, "1");
    expect(detail).toHaveBeenCalledTimes(2);
  });

  it("keeps Steam's results when searching everywhere, and adds the rest", async () => {
    expect(await titles("EVERYWHERE")).toEqual(["STEAM", "TGDB", "Expansion"]);
    expect(third.search).not.toHaveBeenCalled();
  });

  it("asks the next source when TheGamesDB has nothing, if the reader asked to look further", async () => {
    tgdb.search.mockResolvedValue([]);
    expect(await titles("EVERYWHERE")).toEqual(["STEAM", "THIRD", "Expansion"]);
  });

  it("still answers with what it has when the last source then fails", async () => {
    tgdb.search.mockResolvedValue([]);
    down(third);
    expect(await titles("EVERYWHERE")).toEqual(["STEAM", "Expansion"]);
  });

  it("survives losing any part of searching everywhere", async () => {
    down(dlc);
    expect(await titles("EVERYWHERE", "a")).toEqual(["STEAM", "TGDB"]);
    clock += 60_001;
    dlc.search.mockResolvedValue([]);
    down(tgdb);
    expect(await titles("EVERYWHERE", "b")).toEqual(["STEAM", "THIRD"]);
  });

  it("calls it an outage when the fallback fails and the rest found nothing", async () => {
    down(tgdb);
    down(third);
    steam.search.mockResolvedValue([]);
    dlc.search.mockResolvedValue([]);
    await expect(chain.search("a", "EVERYWHERE")).rejects.toThrow(
      "Game search is unavailable",
    );
  });

  it("does not wait on Steam's DLC after Steam's games just failed", async () => {
    down(steam);
    await chain.search("a", "DEFAULT");
    await chain.search("b", "EVERYWHERE");
    expect(dlc.search).not.toHaveBeenCalled();
  });

  it("answers without a lookup that is fine to lose, once it hangs", async () => {
    dlc.search.mockReturnValue(new Promise(() => undefined));
    const quick = createGameSearch(
      {
        DEFAULT: { fallback: [] },
        EVERYWHERE: { fallback: [tgdb], extra: [dlc] },
      },
      () => clock,
      5,
    );
    const hits = await quick.search("a", "EVERYWHERE");
    expect(hits.map((found) => found.title)).toEqual(["TGDB"]);
  });
});
