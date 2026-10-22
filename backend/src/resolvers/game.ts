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
import { searchRawg, releaseYear } from "../lib/rawg.js";
import { validateRawgId } from "../lib/rawgGame.js";
import { rawgGameFields } from "../lib/createReview.js";
import { byIdOrSlug } from "../lib/slug.js";
import { validateString } from "../lib/validate.js";
import { badInput } from "../lib/badInput.js";
import { validateLabels } from "../lib/labels.js";
import {
  GAME_SORTS,
  TITLE_MAX,
  catalogueCount,
  catalogueIds,
  genreValues,
  searchableTitle,
  titleSearchIds,
  type GameFilter,
  type GameSort,
} from "../lib/gameCatalogue.js";

interface UpdateGameInput {
  title?: string;
  genres?: string[];
  description?: string;
  releaseYear?: number;
}

function validateYear(year: number): number {
  const num = Math.trunc(year);
  if (num < 1950 || num > new Date().getFullYear() + 5)
    throw badInput("releaseYear must be a valid game release year.");
  return num;
}

interface GamesArgs extends PageArgs, GameFilter {
  sort?: string | null;
}

function gameSort(value?: string | null): GameSort {
  return GAME_SORTS.includes(value as GameSort)
    ? (value as GameSort)
    : "NEWEST";
}

function gameFilter({
  reviewedOnly,
  genre,
  reviewedBy,
}: GamesArgs): GameFilter {
  return { reviewedOnly, genre, reviewedBy };
}

/** findMany does not preserve the order of an `in` list; the SQL decided it. */
async function gamesInOrder(ordered: { id: string }[]): Promise<Game[]> {
  const ids = ordered.map((row) => row.id);
  const rows = await prisma.game.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((game) => [game.id, game]));
  return ids
    .map((id) => byId.get(id))
    .filter((game): game is Game => game !== undefined);
}

export const gameResolvers = {
  Query: {
    games: async (_parent: unknown, args: GamesArgs, { budget }: Context) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.games);
      const ordered = await prisma.$queryRaw<{ id: string }[]>(
        catalogueIds(gameFilter(args), gameSort(args.sort), take, skip),
      );
      return budget.charge(await gamesInOrder(ordered)).map(serializeDates);
    },

    searchGames: async (
      _parent: unknown,
      args: PageArgs & { query: string },
      { budget }: Context,
    ) => {
      const query = searchableTitle(args.query);
      if (!query) return [];
      const { take } = clampWindow(args, LIST_BOUNDS.gameSearch);
      const ordered = await prisma.$queryRaw<{ id: string }[]>(
        titleSearchIds(query, take),
      );
      return budget.charge(await gamesInOrder(ordered)).map(serializeDates);
    },

    gamesCount: async (_parent: unknown, args: GamesArgs) => {
      const rows = await prisma.$queryRaw<{ count: number }[]>(
        catalogueCount(gameFilter(args)),
      );
      return rows[0]?.count ?? 0;
    },

    gameFacets: async () => {
      const genres = await prisma.$queryRaw<{ value: string }[]>(genreValues());
      return { genres: genres.map((row) => row.value) };
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
      const imported = await prisma.game.findMany({
        where: { rawgId: { in: results.map((g) => String(g.id)) } },
      });
      const byRawgId = new Map(imported.map((game) => [game.rawgId, game]));
      return results.map((g) => {
        const game = byRawgId.get(String(g.id));
        return {
          rawgId: String(g.id),
          title: g.name,
          coverUrl: g.background_image ?? null,
          releaseYear: releaseYear(g.released),
          genres: (g.genres ?? []).map((genre) => genre.name),
          metacritic: g.metacritic ?? null,
          game: game ? serializeDates(game) : null,
        };
      });
    },

    /** What the first review of a game will create, without creating it. */
    rawgGame: async (_parent: unknown, { rawgId }: { rawgId: string }) => {
      const id = validateRawgId(rawgId);
      const game = await prisma.game.findUnique({ where: { rawgId: id } });
      if (game)
        return {
          ...serializeDates(game),
          rawgId: id,
          game: serializeDates(game),
        };

      const fields = await rawgGameFields(id);
      return fields && { ...fields, rawgId: id, metacritic: null, game: null };
    },
  },

  Mutation: {
    updateGame: async (
      _parent: unknown,
      { id, input }: { id: string; input: UpdateGameInput },
      context: Context,
    ) => {
      const authUser = requireAuth(context);
      await requireGameOwnership(id, authUser.id);
      const data: Partial<Omit<Game, "id" | "createdAt" | "updatedAt">> = {};
      if (input.title !== undefined)
        data.title = validateString(input.title, "title", TITLE_MAX);
      if (input.genres !== undefined)
        data.genres = validateLabels(input.genres, "genre");
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
    reviews: async (
      parent: Game,
      args: PageArgs,
      { loaders, budget }: Context,
    ) => {
      const reviews = await loaders.reviewsByGameId.load(parent.id);
      const page = applyWindow(reviews, clampWindow(args, LIST_BOUNDS.nested));
      return budget.charge(page).map(serializeDates);
    },

    /** Aggregated in the database: the listing needs the total, not the rows. */
    reviewCount: async (parent: Game, _args: unknown, { loaders }: Context) =>
      (await loaders.reviewStatsByGameId.load(parent.id)).count,

    averageRating: async (parent: Game, _args: unknown, { loaders }: Context) =>
      (await loaders.reviewStatsByGameId.load(parent.id)).average,
  },
};

/**
 * Game rows are shared, so one edit rewrites the context of every review
 * attached. A game with no recorded creator is owned by nobody and nobody may
 * edit it.
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
