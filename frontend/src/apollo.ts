import { ApolloClient, InMemoryCache, createHttpLink, split } from "@apollo/client";
import { getMainDefinition } from "@apollo/client/utilities";
import type { DocumentNode } from "graphql";

/**
 * Reviews are readable without signing in, so ordinary queries go to the
 * public endpoint. Anything that needs to know who you are goes to the
 * endpoint guarded by the authentik outpost, which is where the session
 * cookie is exchanged for identity headers.
 *
 * Both are same-origin, which is what lets the cookie ride along at all.
 */
const PUBLIC_URI = import.meta.env.VITE_API_URL ?? "/graphql";
const AUTHENTICATED_URI = import.meta.env.VITE_API_AUTH_URL ?? "/graphql-auth";

const publicLink = createHttpLink({ uri: PUBLIC_URI, credentials: "same-origin" });
const authenticatedLink = createHttpLink({
  uri: AUTHENTICATED_URI,
  credentials: "same-origin",
});

/** The `me` query is the only read that depends on the caller's identity. */
const IDENTITY_QUERIES = new Set(["Me"]);

/**
 * True when an operation must go to the authentik-guarded endpoint: every
 * mutation, plus the handful of queries that describe the caller.
 */
export function requiresIdentity({
  query,
  operationName,
}: {
  query: DocumentNode;
  operationName?: string | null;
}): boolean {
  const definition = getMainDefinition(query);
  if (definition.kind === "OperationDefinition" && definition.operation === "mutation") {
    return true;
  }
  return operationName != null && IDENTITY_QUERIES.has(operationName);
}

export const client = new ApolloClient({
  link: split(requiresIdentity, authenticatedLink, publicLink),
  cache: new InMemoryCache(),
});
