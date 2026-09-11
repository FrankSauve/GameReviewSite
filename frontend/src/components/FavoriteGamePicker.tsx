import { useMemo, useRef, useState, useCallback } from "react";
import { useMutation } from "@apollo/client";
import { CLEAR_FAVORITE_GAME, SET_FAVORITE_GAME } from "../graphql/mutations";
import { useDismiss } from "../hooks/useDismiss";
import { GameCover } from "./GameCover";
import type { PickableGame } from "../lib/favorites";

interface FavoriteGamePickerProps {
  category: string;
  label: string;
  games: PickableGame[];
  /** Set when the category already holds a pick, which adds the clear action. */
  filled: boolean;
  onClose: () => void;
}

export function FavoriteGamePicker({
  category,
  label,
  games,
  filled,
  onClose,
}: FavoriteGamePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  useDismiss(containerRef, onClose);

  const [setFavorite, { loading: saving }] = useMutation(SET_FAVORITE_GAME, {
    onCompleted: onClose,
  });
  const [clearFavorite, { loading: clearing }] = useMutation(
    CLEAR_FAVORITE_GAME,
    { onCompleted: onClose },
  );

  // The list is already in memory, so this filters rather than searches: no
  // debounce and no request until something is actually picked.
  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const hits = needle
      ? games.filter((g) => g.title.toLowerCase().includes(needle))
      : games;
    return hits.slice(0, 50);
  }, [games, filter]);

  const pick = useCallback(
    (gameId: string) => {
      void setFavorite({ variables: { input: { category, gameId } } });
    },
    [setFavorite, category],
  );

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={`Pick a game for ${label}`}
      className="absolute z-40 top-full mt-1 left-0 right-0 min-w-[16rem] popover overflow-hidden"
    >
      <div className="p-2 border-b border-line">
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter your reviewed games…"
          aria-label={`Filter games for ${label}`}
          className="w-full bg-surface-raised/70 border border-line-strong rounded-control px-3 py-1.5 text-sm text-content placeholder-content-subtle focus:outline-none focus:ring-2 focus:ring-accent-hover"
        />
      </div>

      {games.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-content-subtle">
          Review a game first — favourites are picked from games you have
          reviewed.
        </p>
      ) : matches.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-content-subtle">
          No match for "{filter}"
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y divide-line">
          {matches.map((game) => (
            <li key={game.id}>
              <button
                type="button"
                disabled={saving}
                onClick={() => pick(game.id)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-raised disabled:opacity-50 transition-colors duration-theme text-left"
              >
                <div className="w-8 h-11 rounded overflow-hidden bg-surface-raised shrink-0">
                  <GameCover game={game} size="sm" decorative />
                </div>
                <span className="text-sm text-content truncate">
                  {game.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {filled && (
        <div className="border-t border-line p-2">
          <button
            type="button"
            disabled={clearing}
            onClick={() => void clearFavorite({ variables: { category } })}
            className="w-full text-xs text-content-subtle hover:text-danger-text disabled:opacity-50 py-1 transition-colors duration-theme"
          >
            Clear {label}
          </button>
        </div>
      )}
    </div>
  );
}
