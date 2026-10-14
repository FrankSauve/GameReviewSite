import type { ReactNode } from "react";
import { GameCover } from "./GameCover";

/** One game in a search dropdown: cover, title, a line of metadata, and a hint. */
export function GameResultRow({
  game,
  hint,
  onClick,
  children,
}: {
  game: { title: string; coverUrl?: string | null };
  hint: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-raised transition-colors duration-theme text-left"
      onClick={onClick}
    >
      <div className="w-10 h-14 rounded-control overflow-hidden bg-surface-raised shrink-0">
        <GameCover game={game} size="sm" decorative />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-meta font-semibold text-content truncate">
          {game.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {children}
        </div>
      </div>
      <span className="text-micro text-content-subtle shrink-0">{hint}</span>
    </button>
  );
}

export function ReviewCountMeta({ count }: { count: number }) {
  return (
    <span className="text-micro text-content-subtle">
      {count} {count === 1 ? "review" : "reviews"}
    </span>
  );
}

export function Spinner() {
  return (
    <svg
      className="w-4 h-4 animate-spin text-content-subtle"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg
      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}
