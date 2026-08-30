import { GraphQLError } from "graphql";

/**
 * A validation failure the caller is meant to read.
 *
 * The code is not decoration. Without it Apollo defaults to
 * INTERNAL_SERVER_ERROR, which `sanitizeError` replaces with "Internal server
 * error." in production — so the rule is enforced without ever saying what it
 * was. See `sanitizeError`'s CLIENT_ERROR_CODES.
 */
export function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}
