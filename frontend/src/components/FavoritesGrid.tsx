import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { GET_USER_FAVORITES } from "../graphql/queries";
import { FAVORITE_CATEGORIES } from "../lib/favoriteCategories";
import type { PickableGame } from "../lib/favorites";
import { FavoriteGamePicker } from "./FavoriteGamePicker";
import { gamePath } from "../lib/links";

interface Favorite {
  id: string;
  category: string;
  game: PickableGame;
}

interface FavoritesData {
  user: { id: string; favorites: Favorite[] } | null;
}

interface FavoritesGridProps {
  userId: string;
  isOwnProfile: boolean;
  /** The games this account has reviewed; the only ones it may pick. */
  pickable: PickableGame[];
}

/**
 * The six other cover sites disagree on alt text, fallback and hover, so this
 * draws its own rather than sharing one with them.
 */
function Cover({ game }: { game: PickableGame }) {
  return game.coverUrl ? (
    <img
      src={game.coverUrl}
      alt=""
      className="w-full h-full object-cover"
      loading="lazy"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
      <span className="text-2xl opacity-30">🎮</span>
    </div>
  );
}

export function FavoritesGrid({
  userId,
  isOwnProfile,
  pickable,
}: FavoritesGridProps) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  // Stable, because useDismiss takes it as a listener dependency.
  const close = useCallback(() => setOpenCategory(null), []);
  const { data, loading } = useQuery<FavoritesData>(GET_USER_FAVORITES, {
    variables: { id: userId },
  });

  const picks = new Map(
    (data?.user?.favorites ?? []).map((f) => [f.category, f]),
  );

  if (loading && !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {FAVORITE_CATEGORIES.map((c) => (
          <div key={c.key} className="space-y-1.5">
            <div className="aspect-video rounded-lg bg-gray-800 animate-pulse" />
            <div className="h-3 rounded bg-gray-800 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {FAVORITE_CATEGORIES.map(({ key, label }) => {
        const pick = picks.get(key);
        const tile = (
          <div className="aspect-video rounded-lg overflow-hidden border border-gray-800 bg-gray-900">
            {pick ? (
              <Cover game={pick.game} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-600">
                {isOwnProfile ? "Select" : "—"}
              </div>
            )}
          </div>
        );

        return (
          <div key={key} className="relative space-y-1.5">
            {isOwnProfile ? (
              <button
                type="button"
                // Opens only; useDismiss inside the picker does the closing,
                // and it fires first on a click back onto this button.
                onClick={() => setOpenCategory(key)}
                aria-expanded={openCategory === key}
                // Filled tiles stay clickable so a pick can be changed, which
                // is the whole point of the grid.
                aria-label={
                  pick
                    ? `Change ${label}: ${pick.game.title}`
                    : `Select ${label}`
                }
                className="block w-full group focus:outline-none focus:ring-2 focus:ring-violet-500 rounded-lg"
              >
                {tile}
              </button>
            ) : pick ? (
              <Link
                to={gamePath(pick.game)}
                className="block"
                title={pick.game.title}
              >
                {tile}
              </Link>
            ) : (
              tile
            )}

            <p className="text-xs text-gray-400 leading-tight">{label}</p>

            {isOwnProfile && openCategory === key && (
              <FavoriteGamePicker
                category={key}
                label={label}
                games={pickable}
                filled={pick != null}
                onClose={close}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
