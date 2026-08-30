import { useQuery } from "@apollo/client";
import { useSearchParams } from "react-router-dom";
import { GET_GAMES, GET_GAME_FACETS, GET_USERS } from "../graphql/queries";
import type { Game, User } from "../types";
import { GameCard } from "../components/GameCard";
import { Pagination } from "../components/Pagination";

/**
 * The games library. Every control lives in the query string, so a filtered,
 * sorted page can be linked to and the back button steps through the library
 * rather than out of it.
 */

const PAGE_SIZE = 24;

const SORTS = [
  ["NEWEST", "Newest"],
  ["OLDEST", "Oldest"],
  ["TITLE", "Title A–Z"],
  ["RELEASE_YEAR", "Release year"],
  ["MOST_REVIEWED", "Most reviewed"],
  ["HIGHEST_RATED", "Highest rated"],
  ["MOST_PLAYED", "Most played"],
] as const;

const SORT_VALUES = SORTS.map(([value]) => value) as readonly string[];

function GameGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card overflow-hidden animate-pulse">
          <div className="h-44 bg-gray-800" />
          <div className="p-4 space-y-3">
            <div className="h-4 bg-gray-800 rounded w-2/3" />
            <div className="h-3 bg-gray-800 rounded w-1/3" />
            <div className="h-3 bg-gray-800 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

const selectClass =
  "bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 px-2 py-1.5 " +
  "focus:outline-none focus:border-violet-700 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500">
      {label}
      {children}
    </label>
  );
}

export function GameLibraryPage() {
  const [params, setParams] = useSearchParams();

  // Clamped low but not high: the total is unknown until the query resolves.
  const requested = parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 1 ? requested - 1 : 0;

  const genre = params.get("genre") ?? "";
  const platform = params.get("platform") ?? "";
  const reviewedBy = params.get("reviewedBy") ?? "";
  const reviewedOnly = params.get("reviewed") === "1";
  const sortParam = params.get("sort") ?? "";
  const sort = SORT_VALUES.includes(sortParam) ? sortParam : "NEWEST";

  const filters = {
    genre: genre || undefined,
    platform: platform || undefined,
    reviewedBy: reviewedBy || undefined,
    reviewedOnly: reviewedOnly || undefined,
  };

  const { data, loading } = useQuery<{ games: Game[]; gamesCount: number }>(
    GET_GAMES,
    { variables: { limit: PAGE_SIZE, offset: page * PAGE_SIZE, sort, ...filters } }
  );
  const { data: facetData } = useQuery<{
    gameFacets: { genres: string[]; platforms: string[] };
  }>(GET_GAME_FACETS);
  const { data: usersData } = useQuery<{ users: User[] }>(GET_USERS);

  const games = data?.games ?? [];
  const total = data?.gamesCount ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const filtered = Boolean(genre || platform || reviewedBy || reviewedOnly);

  /**
   * Changing a control returns to page one. The page number describes a window
   * onto one particular result set, so carrying it across a filter change lands
   * the reader on an empty page of a shorter list.
   */
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  const goTo = (nextPage: number) => {
    const next = new URLSearchParams(params);
    // Page one is the bare URL, so it is not a second history entry.
    if (nextPage === 0) next.delete("page");
    else next.set("page", String(nextPage + 1));
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <span className="w-1 h-5 bg-violet-500 rounded-full inline-block" />
          Games Library
        </h1>
        {total > 0 && (
          <span className="text-xs text-gray-600">
            {total} {total === 1 ? "game" : "games"}
          </span>
        )}
      </div>

      <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Field label="Sort">
          <select
            aria-label="Sort"
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className={selectClass}
          >
            {SORTS.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Genre">
          <select
            aria-label="Genre"
            value={genre}
            onChange={(e) => update({ genre: e.target.value })}
            className={selectClass}
          >
            <option value="">Any</option>
            {(facetData?.gameFacets.genres ?? []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Platform">
          <select
            aria-label="Platform"
            value={platform}
            onChange={(e) => update({ platform: e.target.value })}
            className={selectClass}
          >
            <option value="">Any</option>
            {(facetData?.gameFacets.platforms ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Reviewed by">
          <select
            aria-label="Reviewed by"
            value={reviewedBy}
            onChange={(e) => update({ reviewedBy: e.target.value })}
            className={selectClass}
          >
            <option value="">Anyone</option>
            {(usersData?.users ?? []).map((u) => (
              <option key={u.id} value={u.slug ?? u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={reviewedOnly}
            onChange={(e) => update({ reviewed: e.target.checked ? "1" : "" })}
            className="accent-violet-600"
          />
          Reviewed only
        </label>

        {filtered && (
          <button
            onClick={() =>
              update({ genre: "", platform: "", reviewedBy: "", reviewed: "" })
            }
            className="ml-auto text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading && <GameGridSkeleton />}

      {!loading && games.length === 0 && (
        <div className="card p-12 text-center space-y-3">
          <p className="text-4xl">🎮</p>
          <p className="text-gray-400 font-medium">
            {total > 0
              ? "Nothing on this page"
              : filtered
                ? "No games match these filters"
                : "No games yet"}
          </p>
          <p className="text-sm text-gray-600">
            {total > 0
              ? "The library is not that long — try page one."
              : filtered
                ? "Clear a filter to widen the search."
                : "Search for a game in the navbar to add the first one."}
          </p>
        </div>
      )}

      {!loading && games.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={goTo}
            label="Games library pages"
          />
        </>
      )}
    </div>
  );
}
