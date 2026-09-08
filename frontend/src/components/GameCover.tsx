import { titleGradient } from "../lib/coverGradient";

export type CoverSize = "sm" | "md" | "lg";

/** The placeholder emoji scales with the box; the image itself always fills it. */
const EMOJI: Record<CoverSize, string> = {
  sm: "text-lg",
  md: "text-3xl",
  lg: "text-4xl",
};

interface GameCoverProps {
  // Required but nullable: every caller has a game to pass, and several
  // only know they have one after a query resolves.
  game: { title: string; coverUrl?: string | null } | null | undefined;
  size?: CoverSize;
  /** The title already sits beside it in the DOM, so the image adds nothing. */
  decorative?: boolean;
  /** Above the fold, where deferring the fetch would only delay the hero. */
  eager?: boolean;
}

/**
 * Fills its parent, which owns the size and any scrim laid over it.
 *
 * `group-hover:scale-105` is inert without a `.group` ancestor, so it costs the
 * callers that do not want it nothing.
 */
export function GameCover({
  game,
  size = "md",
  decorative = false,
  eager = false,
}: GameCoverProps) {
  const title = game?.title ?? "";

  if (game?.coverUrl) {
    return (
      <img
        src={game.coverUrl}
        alt={decorative ? "" : title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        {...(eager ? {} : { loading: "lazy" as const })}
      />
    );
  }

  return (
    <div
      className={`w-full h-full bg-gradient-to-br ${titleGradient(title)} flex items-center justify-center`}
    >
      <span className={`${EMOJI[size]} opacity-30`}>🎮</span>
    </div>
  );
}
