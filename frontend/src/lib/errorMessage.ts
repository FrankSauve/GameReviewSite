import { CombinedGraphQLErrors, type ErrorLike } from "@apollo/client";

/** The first GraphQL error alone: the combined message joins every error with newlines. */
export function errorMessage(error: ErrorLike): string {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors[0]?.message ?? error.message;
  }
  return error.message;
}

/** A session can end while the page still holds `me`: only the API's refusal shows it. */
export function isSignedOutError(error: ErrorLike | undefined): boolean {
  return (
    CombinedGraphQLErrors.is(error) &&
    error.errors.some(
      ({ extensions }) => extensions?.["code"] === "UNAUTHENTICATED",
    )
  );
}
