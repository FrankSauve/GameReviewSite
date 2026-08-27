import type { GraphQLFormattedError } from "graphql";
import { isProduction } from "../security";

const CLIENT_ERROR_CODES = new Set([
  "BAD_USER_INPUT",
  "GRAPHQL_PARSE_FAILED",
  "GRAPHQL_VALIDATION_FAILED",
  "PERSISTED_QUERY_NOT_FOUND",
  "PERSISTED_QUERY_NOT_SUPPORTED",
  "OPERATION_RESOLUTION_FAILURE",
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "QUERY_TOO_LARGE",
]);

const GENERIC_MESSAGE = "Internal server error.";

/**
 * Strips everything from an error that the client has no business seeing.
 *
 * Only in production: locally the real message is what makes a failure
 * debuggable, and the tests assert against it.
 */
export function sanitizeError(
  formatted: GraphQLFormattedError
): GraphQLFormattedError {
  const code = formatted.extensions?.["code"];
  const codeString = typeof code === "string" ? code : "INTERNAL_SERVER_ERROR";

  // Never forward anything but the code, whatever the environment. Apollo puts
  // stack traces and, for some plugins, the whole request under extensions.
  const safeExtensions = { code: codeString };

  if (!isProduction() || CLIENT_ERROR_CODES.has(codeString)) {
    return { ...formatted, extensions: safeExtensions };
  }

  // `locations` and `path` describe our schema, not the caller's request, and
  // are of no use to a client that cannot see the error anyway.
  return {
    message: GENERIC_MESSAGE,
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  };
}
