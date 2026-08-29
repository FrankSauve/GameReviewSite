import { useState, useEffect, useRef, useCallback } from "react";
import { useLazyQuery, useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { SEARCH_GAMES_EXTERNAL } from "../graphql/queries";
import { IMPORT_GAME } from "../graphql/mutations";
import { GET_GAMES } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import type { ExternalGame } from "../types";
import { gamePath } from "../lib/links";

interface SearchResult {
  searchGamesExternal: ExternalGame[];
}
interface ImportResult {
  importGame: { id: string; slug?: string | null };
}

export function GameSearchBar() {
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, { data, loading: searching }] = useLazyQuery<SearchResult>(
    SEARCH_GAMES_EXTERNAL,
    { fetchPolicy: "network-only" }
  );

  const [importGame, { loading: importing }] = useMutation<ImportResult>(IMPORT_GAME, {
    refetchQueries: [{ query: GET_GAMES }],
  });

  // Debounced search
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) return;
    debounceRef.current = setTimeout(() => {
      void search({ variables: { query: value.trim() } });
    }, 400);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleSelect = useCallback(
    async (game: ExternalGame) => {
      setOpen(false);
      setQuery("");
      if (!user) {
        signIn("/");
        return;
      }
      const result = await importGame({
        variables: {
          input: {
            rawgId: game.rawgId,
            title: game.title,
            coverUrl: game.coverUrl ?? null,
            genre: game.genres?.[0] ?? null,
            platform: game.platforms?.join(", ") ?? null,
            releaseYear: game.releaseYear ?? null,
          },
        },
      });
      const imported = result.data?.importGame;
      if (imported) navigate(gamePath(imported));
    },
    [user, importGame, navigate]
  );

  const results = data?.searchGamesExternal ?? [];
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative flex-1 max-w-md" ref={containerRef}>
      {/* Input */}
      <div className="relative">
        <SearchIcon />
        <input
          ref={inputRef}
          className="w-full bg-gray-800/70 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          placeholder="Search games to review…"
          value={query}
          onChange={handleInput}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          autoComplete="off"
        />
        {(searching || importing) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden">
          {searching && results.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
              <Spinner /> Searching RAWG…
            </div>
          )}

          {!searching && results.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-500">
              No games found for "{query}"
            </div>
          )}

          {results.length > 0 && (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-gray-800">
              {results.map((game) => (
                <li key={game.rawgId}>
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800 transition-colors text-left"
                    onClick={() => void handleSelect(game)}
                  >
                    {/* Cover thumbnail */}
                    <div className="w-10 h-14 rounded-md overflow-hidden bg-gray-800 shrink-0">
                      {game.coverUrl ? (
                        <img
                          src={game.coverUrl}
                          alt={game.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">
                          🎮
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-100 truncate">
                        {game.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {game.releaseYear && (
                          <span className="text-xs text-gray-500">{game.releaseYear}</span>
                        )}
                        {game.genres?.[0] && (
                          <span className="text-xs bg-violet-900/50 text-violet-400 px-1.5 py-0.5 rounded-full">
                            {game.genres[0]}
                          </span>
                        )}
                        {game.metacritic && (
                          <span
                            className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                              game.metacritic >= 75
                                ? "bg-emerald-900/50 text-emerald-400"
                                : game.metacritic >= 50
                                ? "bg-amber-900/50 text-amber-400"
                                : "bg-red-900/50 text-red-400"
                            }`}
                          >
                            {game.metacritic}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action hint */}
                    <span className="text-xs text-gray-600 shrink-0">
                      {user ? "Review →" : "Sign in →"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* RAWG attribution */}
          <div className="px-3 py-2 border-t border-gray-800 flex items-center justify-end gap-1">
            <span className="text-xs text-gray-600">Powered by</span>
            <a
              href="https://rawg.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 hover:text-gray-400"
            >
              RAWG
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
