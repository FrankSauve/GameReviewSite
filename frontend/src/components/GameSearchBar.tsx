import { useState, useRef, useCallback } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import { SEARCH_GAMES } from "../graphql/queries";
import type { Game } from "../types";
import { gamePath } from "../lib/links";
import { useDismiss } from "../hooks/useDismiss";
import { formatRating, ratingColor } from "../lib/rating";
import {
  GameResultRow,
  ReviewCountMeta,
  SearchIcon,
  Spinner,
} from "./GameResultRow";

interface SearchResult {
  searchGames: Game[];
}

/** Searches the games already reviewed here. New games come in through AddGameButton. */
export function GameSearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, { data, loading, variables }] = useLazyQuery<
    SearchResult,
    { query: string }
  >(SEARCH_GAMES, { fetchPolicy: "network-only" });

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) return;
    debounceRef.current = setTimeout(() => {
      void search({ variables: { query: value.trim() } });
    }, 150);
  };

  const dismiss = useCallback(() => {
    setOpen(false);
    inputRef.current?.blur();
  }, []);
  useDismiss(containerRef, dismiss);

  const openGame = (game: Game) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    void navigate(gamePath(game));
  };

  const results = data?.searchGames ?? [];
  const trimmed = query.trim();
  const showDropdown = open && trimmed.length >= 2;
  // Stays expanded under an open dropdown, so a blur that doesn't dismiss
  // (a tap on a result, the keyboard's Done) doesn't hide the query it shows.
  const expanded = focused || showDropdown;
  // Still debouncing counts as searching, or "no match" flashes before the request.
  const searching =
    trimmed.length >= 2 && (loading || variables?.query !== trimmed);

  return (
    <div className="relative flex-1 min-w-12 max-w-md" ref={containerRef}>
      {/* Input. On a phone it rests as just the icon; expanded, it covers the
          header's fixed h-16, the same assumption the dropdown makes. */}
      <div
        className={
          expanded
            ? "max-sm:fixed max-sm:inset-x-0 max-sm:top-0 max-sm:h-16 max-sm:px-4 max-sm:flex max-sm:items-center max-sm:bg-bg max-sm:z-50"
            : ""
        }
      >
        <div className="relative w-full">
          <SearchIcon />
          <input
            ref={inputRef}
            aria-label="Search reviewed games"
            className={`input-field rounded-card pl-9 pr-4 text-meta ${
              expanded
                ? ""
                : "max-sm:text-transparent max-sm:placeholder:text-transparent"
            }`}
            placeholder="Search reviewed games…"
            value={query}
            onChange={handleInput}
            onFocus={() => {
              setFocused(true);
              if (query.trim().length >= 2) setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            autoComplete="off"
          />
          {searching && (
            <div
              className={`absolute right-3 top-1/2 -translate-y-1/2 ${expanded ? "" : "max-sm:hidden"}`}
            >
              <Spinner />
            </div>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        // The header is sticky at top-0 with a fixed h-16, so max-sm can pin the
        // panel under it with static insets instead of measuring the input.
        <div className="absolute top-full mt-2 left-0 right-0 max-sm:fixed max-sm:top-16 max-sm:left-2 max-sm:right-2 popover z-50 overflow-hidden">
          {searching && results.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-meta text-content-subtle">
              <Spinner /> Searching…
            </div>
          )}

          {!searching && results.length === 0 && (
            <div className="py-6 text-center text-meta text-content-subtle">
              No reviewed games match "{query}"
            </div>
          )}

          {results.length > 0 && (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-line">
              {results.map((game) => (
                <li key={game.id}>
                  <GameResultRow
                    game={game}
                    hint="View →"
                    onClick={() => openGame(game)}
                  >
                    {game.releaseYear && (
                      <span className="text-micro text-content-subtle">
                        {game.releaseYear}
                      </span>
                    )}
                    {game.averageRating != null && (
                      <span
                        className={`font-numeric text-micro font-bold ${ratingColor(game.averageRating)}`}
                      >
                        {formatRating(game.averageRating)}
                      </span>
                    )}
                    <ReviewCountMeta count={game.reviewCount ?? 0} />
                  </GameResultRow>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
