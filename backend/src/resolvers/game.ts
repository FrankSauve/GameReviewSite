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
import { validateString } from "../lib/validate.js";
import { badInput } from "../lib/badInput.js";
import {
  GAME_SORTS,
  catalogueCount,
  catalogueIds,
  labelValues,
  type GameFilter,
  type GameSort,
} from "../lib/gameCatalogue.js";

interface CreateGameInput {
  title: string;
  genres?: string[];
  platforms?: string[];
  description?: string;
  releaseYear?: number;
}

interface UpdateGameInput {
  title?: string;
  genres?: string[];
  platforms?: string[];
  description?: string;
  releaseYear?: number;
}

interface ImportGameInput {
  rawgId: string;
  title: string;
  coverUrl?: string;
  genres?: string[];
  platforms?: string[];
  releaseYear?: number;
}

/**
 * Duplicated as MAX_LABELS in frontend/src/pages/AddGamePage.tsx, which draws
 * the counter on the form. Change both or the form promises entries the server
 * silently drops.
 */
export const MAX_LABELS = 5;

const LABEL_MAX_LENGTH = 100;

/** Past the cap is dropped, not refused: being on many platforms is not a
 *  malformed request, and refusing it is what made Terraria unaddable. */
function validateLabels(values: string[], field: string): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > LABEL_MAX_LENGTH)
      throw badInput(`Each ${field} must be at most ${LABEL_MAX_LENGTH} characters.`);

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(trimmed);
    if (kept.length === MAX_LABELS) break;
  }

  return kept;
}

function validateYear(year: number): number {
  const num = Math.trunc(year);
  if (num < 1950 || num > new Date().getFullYear() + 5)
    throw badInput("releaseYear must be a valid game release year.");
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
    throw badInput("coverUrl must be at most 2000 characters.");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw badInput("coverUrl must be an absolute URL.");
  }
  if (parsed.protocol !== "https:")
    throw badInput("coverUrl must use https.");
  return parsed.toString();
}

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
    throw badInput("rawgId must be a positive integer.");
  return trimmed;
}

interface GamesArgs extends PageArgs, GameFilter {
  sort?: string | null;
}

function gameSort(value?: string | null): GameSort {
  return GAME_SORTS.includes(value as GameSort) ? (value as GameSort) : "NEWEST";
}

function gameFilter({ reviewedOnly, genre, platform, reviewedBy }: GamesArgs): GameFilter {
  return { reviewedOnly, genre, platform, reviewedBy };
}

export const gameResolvers = {
  Query: {
    games: async (_parent: unknown, args: GamesArgs, { budget }: Context) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.games);
      const ordered = await prisma.$queryRaw<{ id: string }[]>(
        catalogueIds(gameFilter(args), gameSort(args.sort), take, skip)
      );
      const ids = ordered.map((row) => row.id);
      const rows = await prisma.game.findMany({ where: { id: { in: ids } } });
      // findMany does not preserve the order of an `in` list; the SQL above is
      // what decided it.
      const byId = new Map(rows.map((game) => [game.id, game]));
      const games = ids
        .map((id) => byId.get(id))
        .filter((game): game is Game => game !== undefined);
      return budget.charge(games).map(serializeDates);
    },

    gamesCount: async (_parent: unknown, args: GamesArgs) => {
      const [{ count }] = await prisma.$queryRaw<{ count: number }[]>(
        catalogueCount(gameFilter(args))
      );
      return count;
    },

    gameFacets: async () => {
      const [genres, platforms] = await Promise.all([
        prisma.$queryRaw<{ value: string }[]>(labelValues("genres")),
        prisma.$queryRaw<{ value: string }[]>(labelValues("platforms")),
      ]);
      return {
        genres: genres.map((row) => row.value),
        platforms: platforms.map((row) => row.value),
      };
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
      const genres = validateLabels(input.genres ?? [], "genre");
      const platforms = validateLabels(input.platforms ?? [], "platform");
      const releaseYear =
        input.releaseYear != null ? validateYear(input.releaseYear) : null;

      const existing = await prisma.game.findUnique({ where: { rawgId } });
      if (existing?.description) return serializeDates(existing);

      let description: string | null = null;
      try {
        const detail = await getRawgGame(parseInt(rawgId, 10));
        description = detail.description_raw?.trim().slice(0, 20_000) || null;
      } catch {
        // Non-fatal — continue without description
      }

      if (existing) {
        if (!description) return serializeDates(existing);
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
          genres,
          platforms,
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
          genres: validateLabels(input.genres ?? [], "genre"),
          platforms: validateLabels(input.platforms ?? [], "platform"),
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
      if (input.genres !== undefined)
        data.genres = validateLabels(input.genres, "genre");
      if (input.platforms !== undefined)
        data.platforms = validateLabels(input.platforms, "platform");
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
