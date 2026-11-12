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

interface GameCoverProps {
  // Required but nullable: every caller has a game to pass, and several
  // only know they have one after a query resolves.
  game:
    | {
        title: string;
        coverUrl?: string | null;
        posterUrl?: string | null;
        bannerUrl?: string | null;
      }
    | null
    | undefined;
  size?: CoverSize;
  /** The title already sits beside it in the DOM, so the image adds nothing. */
  decorative?: boolean;
  /** Above the fold, where deferring the fetch would only delay the hero. */
  eager?: boolean;
  /**
   * Which of the game's art fits the slot: a portrait thumbnail wants the poster,
   * a wide hero the banner. A poster falls back to the cover; a banner does not,
   * since a caller with no banner art lays the page out differently.
   */
  art?: "cover" | "poster" | "banner";
  /** Told when an image fails, for a caller that lays out around the art. */
  onFail?: (url: string) => void;
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
  art = "cover",
  onFail,
}: GameCoverProps) {
  const [failed, setFailed] = useState<string[]>([]);
  const title = game?.title ?? "";
  const candidates =
    art === "banner"
      ? [game?.bannerUrl]
      : art === "poster"
        ? [game?.posterUrl, game?.coverUrl]
        : [game?.coverUrl];
  const src = candidates.find((url) => url && !failed.includes(url)) ?? null;

  // Keyed by url, so a reused component measures new art afresh.
  const [wholeFor, setWholeFor] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Until the new src loads, the element still reports the old art's size.
  const loaded = useRef<string | null>(null);
  const measure = useCallback(() => {
    const img = imgRef.current;
    // Banner art is made to be cropped to any banner.
    if (!img || !src || art === "banner" || loaded.current !== src) return;
    const fits = cropsWell(
      { width: img.naturalWidth, height: img.naturalHeight },
      { width: img.clientWidth, height: img.clientHeight },
    );
    setWholeFor(fits ? null : src);
  }, [src, art]);

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
        {...(decorative ? {} : { role: "img", "aria-label": title })}
      >
        <span aria-hidden="true" className={`${EMOJI[size]} opacity-30`}>
          🎮
        </span>
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
          setFailed((urls) => [...urls, src]);
          onFail?.(src);
        }}
      />
    </div>
  );
}
