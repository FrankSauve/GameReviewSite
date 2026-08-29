export interface User {
  id: string;
  slug?: string | null;
  username: string;
  email?: string;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user?: User | null;
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
  createdAt: string;
  user?: User | null;
  game?: GameSnippet | null;
  comments?: Comment[];
}

export interface Game {
  id: string;
  slug?: string | null;
  rawgId?: string | null;
  title: string;
  genres?: string[];
  platforms?: string[];
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
  platforms?: string[];
  metacritic?: number | null;
}

export interface CurrentUser {
  id: string;
  slug?: string | null;
  username: string;
}
