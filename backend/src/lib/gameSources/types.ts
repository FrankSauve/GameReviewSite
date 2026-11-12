export type GameSourceId = "STEAM" | "TGDB" | "RAWG";

/** A search result: only what the picker draws. */
export interface GameHit {
  externalId: string;
  /** Ids of the same game at this source, any of which may be the stored one. */
  otherIds?: string[];
  title: string;
  coverUrl: string | null;
  releaseYear: number | null;
  genres: string[];
  metacritic: number | null;
}

/** What a game row is built from, whichever source supplied it. */
export interface GameFields {
  title: string;
  coverUrl: string | null;
  /** Portrait art, about 2:3, for a thumbnail beside the title. */
  posterUrl: string | null;
  /** Wide art without a logo, for a banner the title is laid over. */
  bannerUrl: string | null;
  genres: string[];
  releaseYear: number | null;
  description: string | null;
}

export interface GameSource {
  id: GameSourceId;
  /** False when it cannot be asked right now: no key, or its allowance is spent. */
  enabled?(): boolean;
  search(query: string): Promise<GameHit[]>;
  /** Null when the source has no game under that id; any other failure throws. */
  detail(externalId: string): Promise<GameFields | null>;
}

export type GameArt = Pick<GameFields, "posterUrl" | "bannerUrl">;

export const NO_ART: GameArt = { posterUrl: null, bannerUrl: null };
