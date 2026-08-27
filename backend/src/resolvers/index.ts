import { userResolvers } from "./user";
import { gameResolvers } from "./game";
import { reviewResolvers } from "./review";
import { commentResolvers } from "./comment";

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
