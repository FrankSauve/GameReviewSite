import { GraphQLError } from "graphql";

/**
 * A validation failure the caller is meant to read. The code is load-bearing:
 * without it `sanitizeError` replaces the message in production. See its
 * CLIENT_ERROR_CODES.
 */
export function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
