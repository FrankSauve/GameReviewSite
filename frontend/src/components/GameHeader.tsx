import { useState, type ReactNode } from "react";
import { GameCover } from "./GameCover";
import { LabelChips } from "./LabelChips";

interface GameHeaderProps {
  game: {
    title: string;
    coverUrl?: string | null;
    genres?: string[] | undefined;
    releaseYear?: number | null;
    description?: string | null;
  };
  /** Shown opposite the genres, e.g. the average rating. */
  children?: ReactNode;
}

export function GameHeader({ game, children }: GameHeaderProps) {
  return (
    <div className="card overflow-hidden">
      {/* Cover hero */}
      {game.coverUrl ? (
        <div className="relative h-56 sm:h-72 overflow-hidden">
          <GameCover game={game} size="lg" eager />
          <div className="absolute inset-0 bg-gradient-to-t from-scrim via-scrim/40 to-transparent" />
          {/* Title overlaid on cover */}
          <div className="absolute bottom-0 left-0 p-6">
            <h1 className="font-display text-display text-content-on-art drop-shadow-lg">
              {game.title}
            </h1>
          </div>
        </div>
      ) : null}

      <div className="p-6 space-y-4">
        {!game.coverUrl && (
          <h1 className="font-display text-display text-content">
            {game.title}
          </h1>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <LabelChips
              labels={game.genres}
              className="text-micro font-medium bg-accent-subtle/50 text-accent-subtle-text px-2.5 py-1 rounded-pill border border-accent-subtle-border"
            />
            {game.releaseYear && (
              <span className="text-meta text-content-subtle">
                {game.releaseYear}
              </span>
            )}
          </div>

          {children}
        </div>

        {game.description && <GameDescription description={game.description} />}
      </div>
    </div>
  );
}

const DESCRIPTION_LIMIT = 400;

function GameDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = description.length > DESCRIPTION_LIMIT;
  const displayed =
    isLong && !expanded
      ? description.slice(0, DESCRIPTION_LIMIT).trimEnd() + "…"
      : description;

  return (
    <div className="border-t border-line pt-4 space-y-2">
      <p className="text-content-muted text-body">{displayed}</p>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-micro text-accent-subtle-text hover:text-accent-subtle-text transition-colors duration-theme"
        >
          {expanded ? "Show less ↑" : "Show more ↓"}
        </button>
      )}
    </div>
  );
}
