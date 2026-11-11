import { useCallback, useEffect, useRef, useState } from "react";
import { titleGradient } from "../lib/coverGradient";
import { cropsWell } from "../lib/coverFit";

export type CoverSize = "sm" | "md" | "lg";

/** The placeholder emoji scales with the box; the image itself always fills it. */
const EMOJI: Record<CoverSize, string> = {
  sm: "text-lg",
  md: "text-3xl",
  lg: "text-4xl",
};

/** Banner art that failed once, so another mount goes straight to the cover. */
const missingBanners = new Set<string>();

interface GameCoverProps {
  // Required but nullable: every caller has a game to pass, and several
  // only know they have one after a query resolves.
  game:
    | { title: string; coverUrl?: string | null; bannerUrl?: string | null }
    | null
    | undefined;
  size?: CoverSize;
  /** The title already sits beside it in the DOM, so the image adds nothing. */
  decorative?: boolean;
  /** Above the fold, where deferring the fetch would only delay the hero. */
  eager?: boolean;
  /** A wide hero, which prefers the game's banner art to its cover. */
  banner?: boolean;
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
  banner = false,
}: GameCoverProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const title = game?.title ?? "";
  const cover = game?.coverUrl ?? null;
  const wanted = banner ? (game?.bannerUrl ?? null) : null;
  const bannerArt =
    wanted && wanted !== failed && !missingBanners.has(wanted) ? wanted : null;
  const src = bannerArt ?? cover;

  // Keyed by url, so a reused component measures new art afresh.
  const [wholeFor, setWholeFor] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Until the new src loads, the element still reports the old art's size.
  const loaded = useRef<string | null>(null);
  const measure = useCallback(() => {
    const img = imgRef.current;
    // Banner art is made to be cropped to any banner.
    if (!img || !src || src === bannerArt || loaded.current !== src) return;
    const fits = cropsWell(
      { width: img.naturalWidth, height: img.naturalHeight },
      { width: img.clientWidth, height: img.clientHeight },
    );
    setWholeFor(fits ? null : src);
  }, [src, bannerArt]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(img);
    return () => observer.disconnect();
  }, [measure]);

  if (!src)
    return (
      <div
        className={`w-full h-full ${titleGradient(title)} flex items-center justify-center`}
      >
        <span className={`${EMOJI[size]} opacity-30`}>🎮</span>
      </div>
    );

  const whole = wholeFor === src;
  const shared = {
    src,
    // The site sends no referrer, and TheGamesDB's CDN refuses an image without one.
    referrerPolicy: "strict-origin" as const,
    ...(eager ? {} : { loading: "lazy" as const }),
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      {whole && (
        <img
          key="backdrop"
          {...shared}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-60"
        />
      )}
      <img
        key="art"
        ref={imgRef}
        {...shared}
        alt={decorative ? "" : title}
        className={`relative w-full h-full ${whole ? "object-contain" : "object-cover"} group-hover:scale-105 transition-transform duration-theme`}
        onLoad={() => {
          loaded.current = src;
          measure();
        }}
        onError={() => {
          if (src !== bannerArt) return;
          missingBanners.add(src);
          setFailed(src);
        }}
      />
    </div>
  );
}
