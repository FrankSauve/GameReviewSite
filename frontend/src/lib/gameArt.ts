export interface GameArt {
  title: string;
  coverUrl?: string | null;
  posterUrl?: string | null;
  bannerUrl?: string | null;
}

export const hasGameArt = (game: GameArt) =>
  !!(game.bannerUrl || game.posterUrl || game.coverUrl);
