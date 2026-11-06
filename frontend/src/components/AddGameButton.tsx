import { useState, useRef, useCallback } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import { SEARCH_GAMES_EXTERNAL } from "../graphql/queries";
import type { ExternalGame } from "../types";
import { gamePath, newGamePath } from "../lib/links";
import { useDismiss } from "../hooks/useDismiss";
import { metacriticColor } from "../lib/rating";
import { errorMessage } from "../lib/errorMessage";
import {
  GameResultRow,
  ReviewCountMeta,
  SearchIcon,
  Spinner,
} from "./GameResultRow";

interface SearchResult {
  searchGamesExternal: ExternalGame[];
}

/**
 * Searches the game sources for a game to review. Picking one writes nothing:
 * a game joins the catalogue with its first review.
 */
export function AddGameButton() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [everywhere, setEverywhere] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, { data, error, loading, variables }] = useLazyQuery<
    SearchResult,
    { query: string; scope: "DEFAULT" | "EVERYWHERE" }
  >(SEARCH_GAMES_EXTERNAL, { fetchPolicy: "network-only" });

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setEverywhere(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) return;
    debounceRef.current = setTimeout(() => {
      void search({ variables: { query: value.trim(), scope: "DEFAULT" } });
    }, 400);
  };

  // A search still waiting on its debounce would spend a source's call on a
  // closed panel.
  const close = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOpen(false);
    setQuery("");
    setEverywhere(false);
  }, []);
  useDismiss(containerRef, close);

  const handleSelect = (game: ExternalGame) => {
    close();
    void navigate(
      game.game
        ? gamePath(game.game)
        : newGamePath(game.source, game.externalId),
    );
  };

  const results = data?.searchGamesExternal ?? [];
  const trimmed = query.trim();
  const searched = trimmed.length >= 2;
  // Still debouncing counts as searching, or "no games found" flashes first.
  const searching = searched && (loading || variables?.query !== trimmed);

  // Steam answers a console title with the wrong games, not with nothing, so
  // only the reader can tell that the rest of the sources are worth asking.
  const searchEverywhere = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setEverywhere(true);
    void search({ variables: { query: trimmed, scope: "EVERYWHERE" } });
  };

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="btn-secondary text-meta py-1.5 px-3 flex items-center gap-1.5"
        aria-expanded={open}
      >
        <span aria-hidden="true">+</span>
        <span className="hidden sm:inline">Add game</span>
        <span className="sr-only sm:hidden">Add game</span>
      </button>

      {open && (
        // Same pinning as the search dropdown: the header is a fixed h-16.
        <div className="absolute top-full mt-2 right-0 w-96 max-sm:fixed max-sm:top-16 max-sm:left-2 max-sm:right-2 max-sm:w-auto popover z-50 overflow-hidden">
          <div className="relative p-2 border-b border-line">
            <SearchIcon />
            <input
              autoFocus
              className="input-field rounded-card pl-9 pr-9 text-meta"
              placeholder="Find a game…"
              value={query}
              onChange={handleInput}
              autoComplete="off"
            />
            {searching && (
              <div className="absolute right-5 top-1/2 -translate-y-1/2">
                <Spinner />
              </div>
            )}
          </div>

          {searching && results.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-meta text-content-subtle">
              <Spinner /> Searching…
            </div>
          )}

          {searched && !searching && error && (
            <div className="py-6 px-4 text-center text-meta text-danger-text">
              {errorMessage(error)}
            </div>
          )}

          {searched && !searching && !error && results.length === 0 && (
            <div className="py-6 text-center text-meta text-content-subtle">
              No games found for "{query}"
            </div>
          )}

          {searched && results.length > 0 && (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-line">
              {results.map((game) => (
                <li key={`${game.source}:${game.externalId}`}>
                  <GameResultRow
                    game={game}
                    hint={game.game ? "View →" : "Add →"}
                    onClick={() => handleSelect(game)}
                  >
                    {game.releaseYear && (
                      <span className="text-micro text-content-subtle">
                        {game.releaseYear}
                      </span>
                    )}
                    {game.game ? (
                      <ReviewCountMeta count={game.game.reviewCount ?? 0} />
                    ) : (
                      game.genres?.[0] && (
                        <span className="text-micro bg-accent-subtle/50 text-accent-subtle-text px-1.5 py-0.5 rounded-pill">
                          {game.genres[0]}
                        </span>
                      )
                    )}
                    {game.metacritic && (
                      <span
                        className={`text-micro font-bold px-1.5 py-0.5 rounded-chip ${metacriticColor(game.metacritic)}`}
                      >
                        {game.metacritic}
                      </span>
                    )}
                  </GameResultRow>
                </li>
              ))}
            </ul>
          )}

          {searched && !searching && !everywhere && (
            <div className="px-3 py-2 border-t border-line text-right">
              <button
                onClick={searchEverywhere}
                className="text-micro text-content-subtle hover:text-content-muted underline underline-offset-2"
              >
                Not listed? Search everywhere
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
