import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";

/**
 * The API is same-origin behind the reverse proxy, which is also what lets the
 * authentik session cookie ride along. No Authorization header is involved:
 * the proxy outpost authenticates the request and forwards the identity.
 */
const httpLink = createHttpLink({
  uri: import.meta.env.VITE_API_URL ?? "/graphql",
  credentials: "same-origin",
});

export const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
});
