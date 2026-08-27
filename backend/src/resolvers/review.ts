import { GraphQLError } from "graphql";
import { Prisma, type Review, type ReviewGrouping } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeDates } from "../lib/serialize.js";
import {
  LIST_BOUNDS,
  applyWindow,
  clampWindow,
  type PageArgs,
} from "../lib/pagination.js";
import { requireAuth, type Context } from "../context.js";

interface CreateReviewInput {
  gameId: string;
  rating: number;
  content: string;
  yearPlayed: number;
  hoursPlayed: number;
}

interface UpdateReviewInput {
  rating?: number;
  content?: string;
  yearPlayed?: number;
  hoursPlayed?: number;
}

/**
 * Reviews are Markdown, and a decade of backlog includes long ones, so the body
 * limit is generous. Comments and game fields are unaffected — each resolver has
 * its own `validateString` with its own default (2000 and 500 respectively).
 *
 * This does widen the worst-case response, and it is worth being precise about how
 * much. The guards in lib/budget.ts and lib/maxRows.ts count rows, not bytes: the
 * budget is 3000 rows, so the ceiling on a single response goes from roughly
 * 3000 x 5000 to 3000 x 20000. Reaching it needs that many long reviews to
 * genuinely exist, so it is a ceiling rather than an amplification — a small query
 * still cannot conjure a large response out of a nearly empty database.
 *
 * The lists that grew fastest are the ones that do not need a body at all: cards
 * show a 180- to 220-character excerpt and fetch the whole thing to do it. A
 * byte-aware budget, or a server-side excerpt field, is the fix. Neither belongs
 * in the commit that turns Markdown on.
 */
export const REVIEW_CONTENT_MAX = 20000;

function validateString(value: string, field: string, maxLength = REVIEW_CONTENT_MAX): string {
  const trimmed = value.trim();
  if (!trimmed) throw new GraphQLError(`${field} must not be empty.`);
  if (trimmed.length > maxLength)
    throw new GraphQLError(`${field} must be at most ${maxLength} characters.`);
  return trimmed;
}

/**
 * Scores are whole or half points on a 1–10 scale: 9.5 is a score, 9.4 is a typo.
 *
 * Off-step values are refused rather than snapped. The column is a `Float` and
 * the previous version of this function quietly rounded to one decimal, so a
 * caller sending 9.4 got a stored 9.4 and a caller sending 9.44 got 9.4 without
 * being told either — and once a backlog import starts feeding scores from an old
 * spreadsheet, silently altering them is the failure mode that is hardest to
 * notice. `x * 2` is exact for halves in binary floating point, so this needs no
 * epsilon.
 */
export const RATING_MIN = 1;
export const RATING_MAX = 10;

function validateRating(rating: number): number {
  const num = Number(rating);
  if (!Number.isFinite(num) || num < RATING_MIN || num > RATING_MAX)
    throw new GraphQLError(
      `rating must be between ${RATING_MIN} and ${RATING_MAX}.`
    );
  if (!Number.isInteger(num * 2))
    throw new GraphQLError("rating must be a whole or half point, such as 9 or 9.5.");
  return num;
}

/**
 * The year the game was played.
 *
 * The floor is 1970 rather than something tighter: the point of the field is a
 * backlog stretching back years, and a wrong-by-a-decade floor would refuse a
 * legitimate entry. The ceiling is next year, because someone finishing a game in
 * late December writing it up in January is ordinary, and anything beyond that is
 * a typo — usually a mistyped four-digit year.
 */
export const YEAR_PLAYED_MIN = 1970;

function validateYearPlayed(year: number): number {
  const num = Number(year);
  const max = new Date().getFullYear() + 1;
  if (!Number.isInteger(num) || num < YEAR_PLAYED_MIN || num > max)
    throw new GraphQLError(
      `yearPlayed must be a whole year between ${YEAR_PLAYED_MIN} and ${max}.`
    );
  return num;
}

/**
 * Hours spent with the game, to one decimal.
 *
 * Hours rather than minutes because that is how people talk about it, and a Float
 * because `rating` already is. One decimal rather than half-hour steps: "12.5
 * hours" is the common case but a 1.25-hour game exists, and refusing it to keep
 * the granularity tidy would be pedantry. Rounded rather than refused, unlike
 * `rating`, because there is no canonical scale here for an off-step value to
 * contradict — 3.14159 hours is a real measurement, just over-reported.
 */
export const HOURS_PLAYED_MAX = 10000;

function validateHoursPlayed(hours: number): number {
  const num = Number(hours);
  if (!Number.isFinite(num) || num <= 0 || num > HOURS_PLAYED_MAX)
    throw new GraphQLError(
      `hoursPlayed must be greater than 0 and at most ${HOURS_PLAYED_MAX}.`
    );
  return Math.round(num * 10) / 10;
}

/**
 * Orderings `reviewSummariesByUser` accepts.
 *
 * Each falls back to a second key so the result is deterministic: two reviews with
 * the same score, or played the same year, would otherwise come back in whatever
 * order Postgres chose that day, and a list that reshuffles between pages is worse
 * than one ordered slightly arbitrarily.
 *
 * `nulls: "last"` matters on yearPlayed. Postgres puts nulls first under DESC, so
 * without it a review with no recorded year would outrank this year's.
 */
type ReviewOrder = "RECENT" | "RATING_DESC" | "YEAR_DESC";

const ORDER_BY: Record<ReviewOrder, Prisma.ReviewOrderByWithRelationInput[]> = {
  RECENT: [{ createdAt: "desc" }],
  RATING_DESC: [{ rating: "desc" }, { createdAt: "desc" }],
  YEAR_DESC: [
    { yearPlayed: { sort: "desc", nulls: "last" } },
    { createdAt: "desc" },
  ],
};

/**
 * The ordering each grouping needs the rows sorted by.
 *
 * Grouping by score over rows the server ordered by date gives correct headings
 * with shuffled contents, which is the kind of wrong that looks right.
 */
const ORDER_FOR_GROUPING: Record<ReviewGrouping, ReviewOrder> = {
  YEAR: "YEAR_DESC",
  SCORE: "RATING_DESC",
  RECENT: "RECENT",
};

/**
 * The ordering a user has arranged their own profile in.
 *
 * Falls back to the schema's own default rather than throwing when the user does
 * not exist: this is a list query, and a missing user should yield an empty list,
 * not an error about a preference.
 */
async function orderForOwner(userId: string): Promise<ReviewOrder> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultReviewGrouping: true },
  });
  return user ? ORDER_FOR_GROUPING[user.defaultReviewGrouping] : "YEAR_DESC";
}

export const reviewResolvers = {
  Query: {
    reviews: async (_parent: unknown, args: PageArgs, { budget }: Context) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.reviews);
      const reviews = await prisma.review.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },

    review: async (_parent: unknown, { id }: { id: string }) => {
      const review = await prisma.review.findUnique({ where: { id } });
      return review ? serializeDates(review) : null;
    },

    recentReviews: async (_parent: unknown, args: PageArgs, { budget }: Context) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.recentReviews);
      const reviews = await prisma.review.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },

    recentReviewsCount: async () => {
      return prisma.review.count();
    },

    reviewsByGame: async (
      _parent: unknown,
      { gameId, ...args }: { gameId: string } & PageArgs,
      { budget }: Context
    ) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.reviews);
      const reviews = await prisma.review.findMany({
        where: { gameId },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },

    reviewsByUser: async (
      _parent: unknown,
      { userId, ...args }: { userId: string } & PageArgs,
      { budget }: Context
    ) => {
      const { take, skip } = clampWindow(args, LIST_BOUNDS.reviews);
      const reviews = await prisma.review.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },

    /**
     * A user's reviews without their bodies.
     *
     * Grouping happens in the browser. A `[ReviewGroup]` of `[Review]` would price
     * badly against the static row rule — group width times review width — for no
     * benefit, since the buckets are presentation and the whole payload is a few
     * tens of kilobytes.
     *
     * Omitting `order` means "the way this user arranged their own profile": the
     * ordering implied by their `defaultReviewGrouping`. Without that, a profile
     * opening on the owner's preference would need two round trips — one to learn
     * the preference, one to fetch rows sorted along its axis — and the first
     * render would either wait or show the wrong order briefly.
     *
     * `yearPlayed` is nullable, and Postgres sorts nulls first on a DESC ordering,
     * which would put the reviews with no recorded year above the most recent ones.
     * `nulls: "last"` keeps the "Unknown" bucket at the bottom where the view wants
     * it.
     */
    reviewSummariesByUser: async (
      _parent: unknown,
      {
        userId,
        order,
        ...args
      }: { userId: string; order?: ReviewOrder | null } & PageArgs,
      { budget }: Context
    ) => {
      const effective = order ?? (await orderForOwner(userId));
      const { take, skip } = clampWindow(args, LIST_BOUNDS.reviewSummaries);
      const reviews = await prisma.review.findMany({
        where: { userId },
        orderBy: ORDER_BY[effective],
        take,
        skip,
      });
      return budget.charge(reviews).map(serializeDates);
    },
  },

  Mutation: {
    createReview: async (
      _parent: unknown,
      { input }: { input: CreateReviewInput },
      context: Context
    ) => {
      const authUser = requireAuth(context);

      const game = await prisma.game.findUnique({ where: { id: input.gameId } });
      if (!game)
        throw new GraphQLError("Game not found.", { extensions: { code: "NOT_FOUND" } });

      const existing = await prisma.review.findFirst({
        where: { userId: authUser.id, gameId: input.gameId },
      });
      if (existing)
        throw new GraphQLError("You have already reviewed this game.");

      const review = await prisma.review.create({
        data: {
          userId: authUser.id,
          gameId: input.gameId,
          rating: validateRating(input.rating),
          content: validateString(input.content, "content"),
          yearPlayed: validateYearPlayed(input.yearPlayed),
          hoursPlayed: validateHoursPlayed(input.hoursPlayed),
        },
      });
      return serializeDates(review);
    },

    updateReview: async (
      _parent: unknown,
      { id, input }: { id: string; input: UpdateReviewInput },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      const existing = await requireOwnership(id, authUser.id);
      const data: Partial<
        Pick<Review, "rating" | "content" | "yearPlayed" | "hoursPlayed">
      > = {};
      if (input.rating !== undefined) data.rating = validateRating(input.rating);
      if (input.content !== undefined)
        data.content = validateString(input.content, "content");
      if (input.yearPlayed !== undefined)
        data.yearPlayed = validateYearPlayed(input.yearPlayed);
      if (input.hoursPlayed !== undefined)
        data.hoursPlayed = validateHoursPlayed(input.hoursPlayed);
      const review = await prisma.review.update({ where: { id: existing.id }, data });
      return serializeDates(review);
    },

    deleteReview: async (
      _parent: unknown,
      { id }: { id: string },
      context: Context
    ) => {
      const authUser = requireAuth(context);
      await requireOwnership(id, authUser.id);
      await prisma.review.delete({ where: { id } });
      return true;
    },
  },

  /**
   * Reuses the same loaders as `Review`, so a page of 200 summaries is two batched
   * queries for the games and the comment counts rather than 400 individual ones.
   *
   * Not spread from `reviewResolvers.Review`: that object carries a `content`
   * resolver, and `ReviewSummary` has no such field for it to resolve.
   */
  ReviewSummary: {
    game: async (parent: Review, _args: unknown, { loaders }: Context) => {
      const game = await loaders.gameById.load(parent.gameId);
      return game ? serializeDates(game) : null;
    },

    commentCount: async (parent: Review, _args: unknown, { loaders }: Context) =>
      (await loaders.commentsByReviewId.load(parent.id)).length,
  },

  Review: {
    /**
     * Charges the request's text budget. Every path that returns a review body —
     * the four root queries, plus `User.reviews` and `Game.reviews` — resolves it
     * through here, so one interception covers all of them.
     */
    content: (parent: Review, _args: unknown, { budget }: Context) =>
      budget.chargeText(parent.content),

    user: async (parent: Review, _args: unknown, { loaders }: Context) => {
      const user = await loaders.userById.load(parent.userId);
      return user ? serializeDates(user) : null;
    },

    game: async (parent: Review, _args: unknown, { loaders }: Context) => {
      const game = await loaders.gameById.load(parent.gameId);
      return game ? serializeDates(game) : null;
    },

    comments: async (parent: Review, args: PageArgs, { loaders, budget }: Context) => {
      const comments = await loaders.commentsByReviewId.load(parent.id);
      const page = applyWindow(comments, clampWindow(args, LIST_BOUNDS.nested));
      return budget.charge(page).map(serializeDates);
    },

    commentCount: async (parent: Review, _args: unknown, { loaders }: Context) => {
      const comments = await loaders.commentsByReviewId.load(parent.id);
      return comments.length;
    },
  },
};

async function requireOwnership(reviewId: string, userId: string): Promise<Review> {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review)
    throw new GraphQLError("Review not found.", { extensions: { code: "NOT_FOUND" } });
  if (review.userId !== userId)
    throw new GraphQLError("You can only modify your own reviews.", {
      extensions: { code: "FORBIDDEN" },
    });
  return review;
}
