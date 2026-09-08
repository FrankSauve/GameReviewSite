import { userResolvers } from "./user.js";
import { gameResolvers } from "./game.js";
import { reviewResolvers } from "./review.js";
import { commentResolvers } from "./comment.js";
import { articleResolvers } from "./article.js";
import { reactionResolvers } from "./reaction.js";
import { favoriteResolvers } from "./favorite.js";

export const resolvers = {
  Query: {
    ...userResolvers.Query,
    ...gameResolvers.Query,
    ...reviewResolvers.Query,
    ...commentResolvers.Query,
    ...articleResolvers.Query,
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...gameResolvers.Mutation,
    ...reviewResolvers.Mutation,
    ...commentResolvers.Mutation,
    ...articleResolvers.Mutation,
    ...reactionResolvers.Mutation,
    ...favoriteResolvers.Mutation,
  },
  User: { ...userResolvers.User, ...favoriteResolvers.User },
  Game: gameResolvers.Game,
  Review: reviewResolvers.Review,
  // Its own entry rather than a spread of Review: ReviewSummary has no body, so
  // Review's content resolver has no field here to resolve.
  ReviewSummary: reviewResolvers.ReviewSummary,
  Comment: commentResolvers.Comment,
  FavoriteGame: favoriteResolvers.FavoriteGame,
  Article: articleResolvers.Article,
};
