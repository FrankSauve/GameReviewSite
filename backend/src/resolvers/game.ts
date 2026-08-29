import { GraphQLError } from "graphql";
import type { Game } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeDates } from "../lib/serialize.js";
import {
  LIST_BOUNDS,
  applyWindow,
  clampWindow,
  type PageArgs,
} from "../lib/pagination.js";
import { requireAuth, type Context } from "../context.js";
import { searchRawg, getRawgGame, releaseYear } from "../lib/rawg.js";
import { byIdOrSlug, slugify, uniqueSlug } from "../lib/slug.js";

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

/**
 * Cover images end up in an <img src> on every visitor's page, so the scheme is
 * not a free choice: without this an authenticated caller could point it at any
 * URL and have every reader's browser fetch it.
 */
function validateCoverUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 2000)
    throw new GraphQLError("coverUrl must be at most 2000 characters.");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new GraphQLError("coverUrl must be an absolute URL.");
  }
  if (parsed.protocol !== "https:")
    throw new GraphQLError("coverUrl must use https.");
  return parsed.toString();
}

/**
 * A free slug for a new game. Insert path only — an existing game keeps its slug,
 * including when `importGame` finds it already there and backfills a description.
 */
async function newGameSlug(title: string): Promise<string> {
  return uniqueSlug(
    slugify(title, "game"),
    async (candidate) => (await prisma.game.count({ where: { slug: candidate } })) > 0
  );
}

/** RAWG identifiers are integers; this is also what gets parsed for the detail fetch. */
function validateRawgId(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{1,12}$/.test(trimmed))
    throw new GraphQLError("rawgId must be a positive integer.");
  return trimmed;
}

export const gameResolvers = {
  Query: {
    games: async (_parent: unknown, args: PageArgs, { budget }: Context) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.games);
      const games = await prisma.game.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(games).map(serializeDates);
    },

    game: async (_parent: unknown, { id }: { id: string }) => {
      const game = await prisma.game.findFirst({ where: byIdOrSlug(id) });
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
      const authUser = requireAuth(context);

      // These arrive from the client, not from RAWG, and so need re-validation.
      const rawgId = validateRawgId(input.rawgId);
      const title = validateString(input.title, "title", 200);
      const coverUrl = input.coverUrl ? validateCoverUrl(input.coverUrl) : null;
      const genre = input.genre ? validateString(input.genre, "genre", 100) : null;
      const platform = input.platform
        ? validateString(input.platform, "platform", 100)
        : null;
      const releaseYear =
        input.releaseYear != null ? validateYear(input.releaseYear) : null;

      let description: string | null = null;
      try {
        const detail = await getRawgGame(parseInt(rawgId, 10));
        description = detail.description_raw?.trim().slice(0, 20_000) || null;
      } catch {
        // Non-fatal — continue without description
      }

      const existing = await prisma.game.findUnique({ where: { rawgId } });

      if (existing) {
        if (existing.description || !description) return serializeDates(existing);
        const backfilled = await prisma.game.update({
          where: { id: existing.id },
          data: { description },
        });
        return serializeDates(backfilled);
      }

      const game = await prisma.game.create({
        data: {
          rawgId,
          slug: await newGameSlug(title),
          title,
          coverUrl,
          genre,
          platform,
          releaseYear,
          description,
          createdById: authUser.id,
        },
      });
      return serializeDates(game);
    },

    createGame: async (
      _parent: unknown,
      { input }: { input: CreateGameInput },
      context: Context,
    ) => {
      const authUser = requireAuth(context);
      const title = validateString(input.title, "title", 200);

      const game = await prisma.game.create({
        data: {
          rawgId: null,
          slug: await newGameSlug(title),
          title,
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
          createdById: authUser.id,
        },
      });
      return serializeDates(game);
    },

    updateGame: async (
      _parent: unknown,
      { id, input }: { id: string; input: UpdateGameInput },
      context: Context,
    ) => {
      const authUser = requireAuth(context);
      await requireGameOwnership(id, authUser.id);
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
  },

  Game: {
    reviews: async (parent: Game, args: PageArgs, { loaders, budget }: Context) => {
      const reviews = await loaders.reviewsByGameId.load(parent.id);
      const page = applyWindow(reviews, clampWindow(args, LIST_BOUNDS.nested));
      return budget.charge(page).map(serializeDates);
    },

    /**
     * Aggregated in the database. The games listing needs the total but not the
     * rows, and fetching the rows to length them was the largest single
     * contributor to the response size of that page.
     */
    reviewCount: async (parent: Game, _args: unknown, { loaders }: Context) =>
      (await loaders.reviewStatsByGameId.load(parent.id)).count,

    averageRating: async (parent: Game, _args: unknown, { loaders }: Context) =>
      (await loaders.reviewStatsByGameId.load(parent.id)).average,
  },
};

/**
 * Game rows are shared: everybody's reviews hang off the same catalogue entry.
 * That is exactly why editing one was the wrong thing to leave open to any
 * signed-in account — a single title or description change rewrites the context
 * of every review attached to it, and nothing recorded who put it there.
 *
 * A game with no recorded creator predates that column and is treated as owned
 * by nobody, so nobody may edit it. RAWG remains the source for imported
 * metadata, and the manual path can always add a fresh entry.
 */
async function requireGameOwnership(id: string, userId: string): Promise<Game> {
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game)
    throw new GraphQLError("Game not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  if (game.createdById !== userId)
    throw new GraphQLError("You can only edit games you added.", {
      extensions: { code: "FORBIDDEN" },
    });
  return game;
}
