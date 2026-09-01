export interface User {
  id: string;
  slug?: string | null;
  username: string;
  email?: string;
  /** A key from lib/avatarColor.ts; null until the account picks one. */
  avatarColor?: string | null;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user?: User | null;
}

/** One emoji on a review or a comment, as the API summarises it. */
export interface ReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
}

export interface GameSnippet {
  id: string;
  slug?: string | null;
  title: string;
  genres?: string[];
  coverUrl?: string | null;
  releaseYear?: number | null;
}

export interface Review {
  id: string;
  slug?: string | null;
  rating: number;
  content: string;
  yearPlayed?: number | null;
  hoursPlayed?: number | null;
  /** One of lib/platforms.ts; null for a review that records none. */
  platform?: string | null;
  createdAt: string;
  user?: User | null;
  game?: GameSnippet | null;
  comments?: Comment[];
  reactions?: ReactionSummary[] | null;
}

export interface Game {
  id: string;
  slug?: string | null;
  rawgId?: string | null;
  title: string;
  genres?: string[];
  description?: string | null;
  coverUrl?: string | null;
  releaseYear?: number | null;
  averageRating?: number | null;
  reviewCount?: number | null;
  reviews?: Review[];
}

export interface ExternalGame {
  rawgId: string;
  title: string;
  coverUrl?: string | null;
  releaseYear?: number | null;
  genres?: string[];
  metacritic?: number | null;
}

export interface CurrentUser {
  id: string;
  slug?: string | null;
  username: string;
  avatarColor?: string | null;
}

/**
 * A manifesto, an essay — anything that is not a review. Called an Article by
 * the API and reached at /articles here; see backend/src/resolvers/article.ts.
 */
export interface Article {
  id: string;
  slug?: string | null;
  title: string;
  content: string;
  /** Null while it is a draft, and a draft is only ever returned to its author. */
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  author?: User | null;
}
