import { GraphQLError } from "graphql";
import type { Game } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { serializeDates } from "../lib/serialize";
import { requireAuth, type Context } from "../context";
import { searchRawg, getRawgGame, releaseYear } from "../lib/rawg";

interface CreateGameInput {
  title: string;
  genre?: string;
  platform?: string;
  description?: string;
  releaseYear?: number;
}

interface UpdateGameInput {
  title?: string;
  genre?: string;
  platform?: string;
  description?: string;
  releaseYear?: number;
}

interface ImportGameInput {
  rawgId: string;
  title: string;
  coverUrl?: string;
  genre?: string;
  platform?: string;
  releaseYear?: number;
}

function validateString(value: string, field: string, maxLength = 500): string {
  const trimmed = value.trim();
  if (!trimmed) throw new GraphQLError(`${field} must not be empty.`);
  if (trimmed.length > maxLength)
    throw new GraphQLError(`${field} must be at most ${maxLength} characters.`);
  return trimmed;
}

function validateYear(year: number): number {
  const num = Math.trunc(year);
  if (num < 1950 || num > new Date().getFullYear() + 5)
    throw new GraphQLError("releaseYear must be a valid game release year.");
  return num;
}

export const gameResolvers = {
  Query: {
    games: async () => {
      const games = await prisma.game.findMany({
        orderBy: { createdAt: "desc" },
      });
      return games.map(serializeDates);
    },

    game: async (_parent: unknown, { id }: { id: string }) => {
      const game = await prisma.game.findUnique({ where: { id } });
      return game ? serializeDates(game) : null;
    },

    searchGamesExternal: async (
      _parent: unknown,
      { query }: { query: string },
    ) => {
      if (!query.trim()) return [];
      const results = await searchRawg(query.trim());
      return results.map((g) => ({
        rawgId: String(g.id),
        title: g.name,
        coverUrl: g.background_image ?? null,
        releaseYear: releaseYear(g.released),
        genres: (g.genres ?? []).map((genre) => genre.name),
        platforms: (g.platforms ?? []).map((p) => p.platform.name),
        metacritic: g.metacritic ?? null,
      }));
    },
  },

  Mutation: {
    importGame: async (
      _parent: unknown,
      { input }: { input: ImportGameInput },
      context: Context,
    ) => {
      requireAuth(context);

      // Fetch description from RAWG (also backfills existing games that have none)
      let description: string | null = null;
      try {
        const detail = await getRawgGame(parseInt(input.rawgId, 10));
        description = detail.description_raw?.trim() || null;
      } catch {
        // Non-fatal — continue without description
      }

      const game = await prisma.game.upsert({
        where: { rawgId: input.rawgId },
        update: { description },
        create: {
          rawgId: input.rawgId,
          title: input.title,
          coverUrl: input.coverUrl ?? null,
          genre: input.genre ?? null,
          platform: input.platform ?? null,
          releaseYear: input.releaseYear ?? null,
          description,
        },
      });
      return serializeDates(game);
    },

    createGame: async (
      _parent: unknown,
      { input }: { input: CreateGameInput },
    ) => {
      const data: Omit<Game, "id" | "createdAt" | "updatedAt"> = {
        rawgId: null,
        title: validateString(input.title, "title", 200),
        genre: input.genre ? validateString(input.genre, "genre", 100) : null,
        platform: input.platform
          ? validateString(input.platform, "platform", 100)
          : null,
        description: input.description
          ? validateString(input.description, "description", 2000)
          : null,
        coverUrl: null,
        releaseYear:
          input.releaseYear != null ? validateYear(input.releaseYear) : null,
      };
      const game = await prisma.game.create({ data });
      return serializeDates(game);
    },

    updateGame: async (
      _parent: unknown,
      { id, input }: { id: string; input: UpdateGameInput },
    ) => {
      await requireGame(id);
      const data: Partial<Omit<Game, "id" | "createdAt" | "updatedAt">> = {};
      if (input.title !== undefined)
        data.title = validateString(input.title, "title", 200);
      if (input.genre !== undefined)
        data.genre = input.genre
          ? validateString(input.genre, "genre", 100)
          : null;
      if (input.platform !== undefined)
        data.platform = input.platform
          ? validateString(input.platform, "platform", 100)
          : null;
      if (input.description !== undefined)
        data.description = input.description
          ? validateString(input.description, "description", 2000)
          : null;
      if (input.releaseYear !== undefined)
        data.releaseYear =
          input.releaseYear != null ? validateYear(input.releaseYear) : null;
      const game = await prisma.game.update({ where: { id }, data });
      return serializeDates(game);
    },

    deleteGame: async (_parent: unknown, { id }: { id: string }) => {
      await requireGame(id);
      await prisma.game.delete({ where: { id } });
      return true;
    },
  },

  Game: {
    reviews: async (parent: Game) => {
      const reviews = await prisma.review.findMany({
        where: { gameId: parent.id },
        orderBy: { createdAt: "desc" },
      });
      return reviews.map(serializeDates);
    },

    averageRating: async (parent: Game) => {
      const agg = await prisma.review.aggregate({
        where: { gameId: parent.id },
        _avg: { rating: true },
      });
      return agg._avg.rating;
    },
  },
};

async function requireGame(id: string): Promise<Game> {
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game)
    throw new GraphQLError("Game not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  return game;
}
