import { userResolvers } from "./user.js";
import { gameResolvers } from "./game.js";
import { reviewResolvers } from "./review.js";
import { commentResolvers } from "./comment.js";

export const resolvers = {
  Query: {
    ...userResolvers.Query,
    ...gameResolvers.Query,
    ...reviewResolvers.Query,
    ...commentResolvers.Query,
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...gameResolvers.Mutation,
    ...reviewResolvers.Mutation,
    ...commentResolvers.Mutation,
  },
  User: userResolvers.User,
  Game: gameResolvers.Game,
  Review: reviewResolvers.Review,
  Comment: commentResolvers.Comment,
};
