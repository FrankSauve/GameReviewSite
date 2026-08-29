import { useQuery } from "@apollo/client";
import { useSearchParams } from "react-router-dom";
import { GET_GAMES } from "../graphql/queries";
import type { Game } from "../types";
import { GameCard } from "../components/GameCard";
import { Pagination } from "../components/Pagination";

/**
 * The games library, on its own page.
 *
 * It used to be a strip on the home page with a "Show all N games" toggle that
 * expanded one unpaginated query in place. That query was already fetching the
 * entire catalogue whether or not the toggle was ever pressed, so the cost was
 * paid on every visit to the home page, and it grew with the catalogue.
 *
 * The page number lives in the query string rather than in component state so a
 * page can be linked to and the browser's back button steps through the pages
 * instead of leaving the library entirely.
 */

const PAGE_SIZE = 24;

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

export function GameLibraryPage() {
  const [params, setParams] = useSearchParams();

  // Clamped low but not high: the total is not known until the query resolves,
  // so an out-of-range page renders as an empty page rather than being guessed at.
  const requested = parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 1 ? requested - 1 : 0;

  const { data, loading } = useQuery<{ games: Game[]; gamesCount: number }>(
    GET_GAMES,
    { variables: { limit: PAGE_SIZE, offset: page * PAGE_SIZE } }
  );

  const games = data?.games ?? [];
  const total = data?.gamesCount ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const goTo = (next: number) => {
    // Page one is the bare URL: /games?page=1 and /games are the same page and
    // should not be two entries in the history.
    setParams(next === 0 ? {} : { page: String(next + 1) });
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

      {loading && <GameGridSkeleton />}

      {!loading && games.length === 0 && (
        <div className="card p-12 text-center space-y-3">
          <p className="text-4xl">🎮</p>
          <p className="text-gray-400 font-medium">
            {total > 0 ? "Nothing on this page" : "No games yet"}
          </p>
          <p className="text-sm text-gray-600">
            {total > 0
              ? "The library is not that long — try page one."
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
