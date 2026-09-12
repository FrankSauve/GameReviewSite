import type { FavoriteGame, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeDates } from "../lib/serialize.js";
import { requireAuth, type Context } from "../context.js";
import {
  inGridOrder,
  validateFavoriteCategory,
} from "../lib/favoriteCategories.js";
import { assertReviewedByUser } from "../lib/favorites.js";

interface SetFavoriteGameInput {
  category: string;
  gameId: string;
}

async function ownerOf(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return serializeDates(user);
}

export const favoriteResolvers = {
  Mutation: {
    setFavoriteGame: async (
      _parent: unknown,
      { input }: { input: SetFavoriteGameInput },
      context: Context,
    ) => {
      const authUser = requireAuth(context);
      const category = validateFavoriteCategory(input.category);
      await assertReviewedByUser(authUser.id, input.gameId);

      // Upsert on the unique pair, so re-picking replaces the row and two
      // clicks racing cannot leave a category holding two games.
      await prisma.favoriteGame.upsert({
        where: { userId_category: { userId: authUser.id, category } },
        create: { userId: authUser.id, category, gameId: input.gameId },
        update: { gameId: input.gameId },
      });

      context.loaders.favoritesByUserId.clear(authUser.id);
      return ownerOf(authUser.id);
    },

    clearFavoriteGame: async (
      _parent: unknown,
      { category }: { category: string },
      context: Context,
    ) => {
      const authUser = requireAuth(context);
      const key = validateFavoriteCategory(category);
      // deleteMany, not delete: clearing an already-empty category is a no-op
      // rather than an error, so the button is safe to double-click.
      await prisma.favoriteGame.deleteMany({
        where: { userId: authUser.id, category: key },
      });

      context.loaders.favoritesByUserId.clear(authUser.id);
      return ownerOf(authUser.id);
    },
  },

  User: {
    favorites: async (
      parent: User,
      _args: unknown,
      { loaders, budget }: Context,
    ) =>
      budget
        .charge(inGridOrder(await loaders.favoritesByUserId.load(parent.id)))
        .map(serializeDates),
  },

  FavoriteGame: {
    game: async (
      parent: FavoriteGame,
      _args: unknown,
      { loaders }: Context,
    ) => {
      const game = await loaders.gameById.load(parent.gameId);
      return game ? serializeDates(game) : null;
    },
  },
};
