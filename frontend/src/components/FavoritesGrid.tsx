import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { GET_USER_FAVORITES } from "../graphql/queries";
import { FAVORITE_CATEGORIES } from "../lib/favoriteCategories";
import type { PickableGame } from "../lib/favorites";
import { FavoriteGamePicker } from "./FavoriteGamePicker";
import { GameCover } from "./GameCover";
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
          <div className="relative aspect-video rounded-lg overflow-hidden border border-gray-800 bg-gray-900">
            {pick ? (
              <>
                <GameCover game={pick.game} size="md" decorative />
                {/* The scrim is what makes the title readable over box art of
                    any brightness; the title is why the tile is identifiable. */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950/95 via-gray-950/70 to-transparent px-1.5 pb-1 pt-5">
                  <p className="text-[11px] font-semibold text-gray-100 leading-tight line-clamp-2">
                    {pick.game.title}
                  </p>
                </div>
              </>
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
              <Link to={gamePath(pick.game)} className="block">
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
