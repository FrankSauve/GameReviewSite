import type { User } from "../generated/prisma/client.js";
import { serializeDates } from "../lib/serialize.js";
import { requireAuth, type Context } from "../context.js";
import {
  awardsKey,
  normalizeYearAwards,
  replaceYearAwards,
  type YearAwardsInput,
} from "../lib/awards.js";
import { validateYearPlayed } from "../lib/yearPlayed.js";
import { gameOf } from "./gameOf.js";

interface YearAwardsParent {
  userId: string;
  year: number;
}

export const awardsResolvers = {
  Mutation: {
    setYearAwards: async (
      _parent: unknown,
      { input }: { input: YearAwardsInput },
      context: Context,
    ): Promise<YearAwardsParent> => {
      const authUser = requireAuth(context);
      const rows = normalizeYearAwards(input);
      await replaceYearAwards(authUser.id, rows);

      const key = awardsKey(authUser.id, rows.year);
      context.loaders.awardYearsByUserId.clear(authUser.id);
      context.loaders.awardRanksByKey.clear(key);
      context.loaders.awardCategoriesByKey.clear(key);
      return { userId: authUser.id, year: rows.year };
    },
  },

  User: {
    awardYears: async (
      parent: User,
      _args: unknown,
      { loaders, budget }: Context,
    ) => budget.charge(await loaders.awardYearsByUserId.load(parent.id)),

    awards: (parent: User, { year }: { year: number }): YearAwardsParent => ({
      userId: parent.id,
      year: validateYearPlayed(year, "year"),
    }),
  },

  YearAwards: {
    id: (parent: YearAwardsParent) => awardsKey(parent.userId, parent.year),
    ranking: async (
      parent: YearAwardsParent,
      _args: unknown,
      { loaders, budget }: Context,
    ) =>
      budget
        .charge(
          await loaders.awardRanksByKey.load(
            awardsKey(parent.userId, parent.year),
          ),
        )
        .map(serializeDates),
    categories: async (
      parent: YearAwardsParent,
      _args: unknown,
      { loaders, budget }: Context,
    ) =>
      budget
        .charge(
          await loaders.awardCategoriesByKey.load(
            awardsKey(parent.userId, parent.year),
          ),
        )
        .map(serializeDates),
  },

  AwardRank: { game: gameOf },
  AwardCategory: { game: gameOf },
};
