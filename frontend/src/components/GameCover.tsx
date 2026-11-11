import { useState } from "react";
import { titleGradient } from "../lib/coverGradient";
import { cropsWell } from "../lib/coverFit";

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
 * Fills its parent, which owns the size and any scrim laid over it. Art whose
 * shape is far from the slot's is shown whole, over a blurred copy of itself.
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
  // Keyed by url, so a reused component measures a new game's art afresh.
  const [wholeFor, setWholeFor] = useState<string | null>(null);
  const title = game?.title ?? "";
  const src = game?.coverUrl;

  if (src) {
    const shared = {
      src,
      // The site sends no referrer, and TheGamesDB's CDN refuses an image without one.
      referrerPolicy: "origin" as const,
      ...(eager ? {} : { loading: "lazy" as const }),
    };
    const alt = decorative ? "" : title;

    if (wholeFor === src)
      return (
        <div className="relative w-full h-full overflow-hidden">
          <img
            {...shared}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60"
          />
          <img
            {...shared}
            alt={alt}
            className="relative w-full h-full object-contain group-hover:scale-105 transition-transform duration-theme"
          />
        </div>
      );

    return (
      <img
        {...shared}
        alt={alt}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-theme"
        onLoad={(e) => {
          const img = e.currentTarget;
          const fits = cropsWell(
            { width: img.naturalWidth, height: img.naturalHeight },
            { width: img.clientWidth, height: img.clientHeight },
          );
          if (!fits) setWholeFor(src);
        }}
      />
    );
  }

  return (
    <div
      className={`w-full h-full ${titleGradient(title)} flex items-center justify-center`}
    >
      <span className={`${EMOJI[size]} opacity-30`}>🎮</span>
    </div>
  );
}
