import type { ReactNode } from "react";
import { hasGameArt, type GameArt } from "../lib/gameArt";
import { GameCover } from "./GameCover";

interface GameArtBandProps {
  game: GameArt;
  /** The band's height, and anything else of its box such as rounding. */
  className: string;
  /** Inset of the title block from the band's edges. */
  pad: string;
  /** The title block, laid over the banner or beside the poster. */
  children: ReactNode;
}

/**
 * The art at the top of a game: its banner art behind the title where it has
 * some, otherwise its poster beside the title, over a blur of the same art.
 * With no art at all, the title's placeholder stands in for a banner.
 */
export function GameArtBand({
  game,
  className,
  pad,
  children,
}: GameArtBandProps) {
  if (game.bannerUrl || !hasGameArt(game))
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <GameCover game={game} size="lg" eager art="banner" />
        <div className="absolute inset-0 bg-gradient-to-t from-scrim via-scrim/40 to-transparent" />
        <div className={`absolute bottom-0 left-0 ${pad}`}>{children}</div>
      </div>
    );

  return (
    <div
      className={`relative overflow-hidden flex items-end gap-5 ${pad} ${className}`}
    >
      <div className="absolute inset-0 blur-2xl scale-125 opacity-40">
        <GameCover game={game} size="lg" art="poster" decorative />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-scrim via-scrim/70 to-scrim/40" />
      <div className="relative h-full aspect-[2/3] shrink-0 rounded-control overflow-hidden shadow-lg">
        <GameCover game={game} size="lg" eager art="poster" decorative />
      </div>
      <div className="relative min-w-0">{children}</div>
    </div>
  );
}
