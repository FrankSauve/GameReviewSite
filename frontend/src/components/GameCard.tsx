import { Link } from "react-router-dom";
import type { Game } from "../types";
import { formatRating, ratingColor } from "../lib/rating";
import { gamePath } from "../lib/links";
import { GameCover } from "./GameCover";
interface GameCardProps {
  game: Game;
}

/**
 * Genres are assigned a palette hue, not a colour: --hue-N in the token layer
 * is what a palette restates. An unmapped genre falls back to the plain chip.
 */
const GENRE_HUES: Record<string, string> = {
  "Action RPG": "chip-hue-1",
  RPG: "chip-hue-1",
  Action: "chip-hue-2",
  Adventure: "chip-hue-3",
  Strategy: "chip-hue-4",
  Shooter: "chip-hue-5",
  Sports: "chip-hue-6",
  Horror: "chip-hue-7",
};

function genreHue(genre?: string | null) {
  if (!genre) return "";
  return GENRE_HUES[genre] ?? "";
}

export function GameCard({ game }: GameCardProps) {
  // The aggregate, so a grid of cards need not fetch every review body.
  const reviewCount = game.reviewCount ?? 0;

  return (
    <Link to={gamePath(game)} className="group block">
      <div className="card card-interactive overflow-hidden">
        <div className="relative h-44 overflow-hidden">
          <GameCover game={game} size="lg" />
          {game.coverUrl && (
            <div className="absolute inset-0 bg-gradient-to-t from-scrim/80 via-transparent to-transparent" />
          )}
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-display text-content group-hover:text-accent-subtle-text transition-colors duration-theme line-clamp-1">
              {game.title}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {(game.genres ?? []).slice(0, 2).map((genre) => (
                <span key={genre} className={`chip ${genreHue(genre)}`}>
                  {genre}
                </span>
              ))}
              {game.releaseYear && (
                <span className="text-xs text-content-subtle">
                  {game.releaseYear}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-line">
            {game.averageRating != null ? (
              <div className="flex items-baseline gap-1">
                <span
                  className={`font-numeric text-sm font-extrabold ${ratingColor(game.averageRating)}`}
                >
                  {formatRating(game.averageRating)}
                </span>
                <span className="text-xs text-content-faint">/ 10</span>
              </div>
            ) : (
              <span className="text-xs text-content-faint italic">
                No reviews yet
              </span>
            )}
            <span className="text-xs text-content-subtle">
              {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
