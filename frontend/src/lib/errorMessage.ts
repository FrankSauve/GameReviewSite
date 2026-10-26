import { CombinedGraphQLErrors, type ErrorLike } from "@apollo/client";

/** The first GraphQL error alone: the combined message joins every error with newlines. */
export function errorMessage(error: ErrorLike): string {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors[0]?.message ?? error.message;
  }
  return error.message;
}
