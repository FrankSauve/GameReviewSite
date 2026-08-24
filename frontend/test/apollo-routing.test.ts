import { describe, expect, it } from "vitest";
import { gql } from "@apollo/client";
import { requiresIdentity } from "../src/apollo";
import {
  GET_GAMES,
  GET_GAME,
  GET_RECENT_REVIEWS,
  GET_USERS,
  GET_USER_PROFILE,
  SEARCH_GAMES_EXTERNAL,
} from "../src/graphql/queries";
import {
  CREATE_COMMENT,
  CREATE_GAME,
  CREATE_REVIEW,
  DELETE_COMMENT,
  DELETE_REVIEW,
  GET_ME,
  IMPORT_GAME,
  UPDATE_REVIEW,
} from "../src/graphql/mutations";

/**
 * Which endpoint an operation is sent to is a security boundary, not a
 * preference: the public endpoint is never authenticated, so a mutation routed
 * there fails with UNAUTHENTICATED no matter who the user is.
 */
describe("GraphQL endpoint routing", () => {
  const publicOperations: [string, ReturnType<typeof gql>][] = [
    ["GetGames", GET_GAMES],
    ["GetGame", GET_GAME],
    ["GetRecentReviews", GET_RECENT_REVIEWS],
    ["GetUsers", GET_USERS],
    ["GetUserProfile", GET_USER_PROFILE],
    ["SearchGamesExternal", SEARCH_GAMES_EXTERNAL],
  ];

  const authenticatedOperations: [string, ReturnType<typeof gql>][] = [
    ["Me", GET_ME],
    ["CreateGame", CREATE_GAME],
    ["CreateReview", CREATE_REVIEW],
    ["CreateComment", CREATE_COMMENT],
    ["UpdateReview", UPDATE_REVIEW],
    ["DeleteReview", DELETE_REVIEW],
    ["DeleteComment", DELETE_COMMENT],
    ["ImportGame", IMPORT_GAME],
  ];

  it.each(publicOperations)("routes %s to the public endpoint", (name, query) => {
    expect(requiresIdentity({ query, operationName: name })).toBe(false);
  });

  it.each(authenticatedOperations)(
    "routes %s to the authenticated endpoint",
    (name, query) => {
      expect(requiresIdentity({ query, operationName: name })).toBe(true);
    }
  );

  it("routes any mutation to the authenticated endpoint, named or not", () => {
    const anonymous = gql`
      mutation {
        deleteUser
      }
    `;
    expect(requiresIdentity({ query: anonymous })).toBe(true);
  });

  it("does not send an unknown query to the authenticated endpoint", () => {
    const future = gql`
      query SomeNewPublicRead {
        games {
          id
        }
      }
    `;
    expect(requiresIdentity({ query: future, operationName: "SomeNewPublicRead" })).toBe(
      false
    );
  });
});
