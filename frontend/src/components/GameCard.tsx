import { Link } from "react-router-dom";
import type { Game } from "../types";
import { formatRating, ratingColor } from "../lib/rating";
import { gamePath } from "../lib/links";
interface GameCardProps {
  game: Game;
}

const GENRE_COLORS: Record<string, string> = {
  "Action RPG": "bg-violet-900/50 text-violet-300",
  RPG: "bg-violet-900/50 text-violet-300",
  Action: "bg-red-900/50 text-red-300",
  Adventure: "bg-emerald-900/50 text-emerald-300",
  Strategy: "bg-blue-900/50 text-blue-300",
  Shooter: "bg-orange-900/50 text-orange-300",
  Sports: "bg-cyan-900/50 text-cyan-300",
  Horror: "bg-rose-900/50 text-rose-300",
};

function genreColor(genre?: string | null) {
  if (!genre) return "bg-gray-800 text-gray-400";
  return GENRE_COLORS[genre] ?? "bg-gray-800 text-gray-400";
}

// Deterministic gradient fallback for games without cover art
function titleGradient(title: string): string {
  const gradients: [string, ...string[]] = [
    "from-violet-900 via-indigo-900 to-gray-900",
    "from-rose-900 via-pink-900 to-gray-900",
    "from-emerald-900 via-teal-900 to-gray-900",
    "from-blue-900 via-cyan-900 to-gray-900",
    "from-amber-900 via-orange-900 to-gray-900",
    "from-fuchsia-900 via-purple-900 to-gray-900",
  ];
  const idx =
    [...title].reduce((acc, c) => acc + c.charCodeAt(0), 0) % gradients.length;
  return gradients[idx] ?? gradients[0];
}

export function GameCard({ game }: GameCardProps) {
  // The aggregate, so a grid of cards need not fetch every review body.
  const reviewCount = game.reviewCount ?? 0;

  return (
    <Link to={gamePath(game)} className="group block">
      <div className="card overflow-hidden hover:border-violet-700 hover:shadow-lg hover:shadow-violet-900/20 transition-all duration-200">
        {/* Cover image or gradient fallback */}
        <div className="relative h-44 overflow-hidden">
          {game.coverUrl ? (
            <>
              <img
                src={game.coverUrl}
                alt={game.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              {/* Overlay for platform badge */}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-transparent to-transparent" />
            </>
          ) : (
            <div
              className={`w-full h-full bg-gradient-to-br ${titleGradient(game.title)} flex items-center justify-center`}
            >
              <span className="text-4xl opacity-30">🎮</span>
            </div>
          )}

          {game.platforms && game.platforms.length > 0 && (
            <span
              className="absolute bottom-2 left-3 text-xs font-medium bg-black/60 text-gray-300 px-2 py-1 rounded-md backdrop-blur-sm"
              title={game.platforms.join(", ")}
            >
              {game.platforms[0]}
              {game.platforms.length > 1 && (
                <span className="text-gray-500"> +{game.platforms.length - 1}</span>
              )}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-bold text-gray-100 group-hover:text-violet-300 transition-colors line-clamp-1">
              {game.title}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {(game.genres ?? []).slice(0, 2).map((genre) => (
                <span
                  key={genre}
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${genreColor(genre)}`}
                >
                  {genre}
                </span>
              ))}
              {game.releaseYear && (
                <span className="text-xs text-gray-500">{game.releaseYear}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-gray-800">
            {game.averageRating != null ? (
              <div className="flex items-baseline gap-1">
                <span className={`text-sm font-extrabold ${ratingColor(game.averageRating)}`}>
                  {formatRating(game.averageRating)}
                </span>
                <span className="text-xs text-gray-600">/ 10</span>
              </div>
            ) : (
              <span className="text-xs text-gray-600 italic">No reviews yet</span>
            )}
            <span className="text-xs text-gray-500">
              {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
