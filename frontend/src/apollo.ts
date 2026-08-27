import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";

/**
 * One endpoint for everything.
 *
 * There used to be two, and which one an operation went to was a security
 * boundary: nginx's auth_request could not read a GraphQL body, so the only way
 * to gate writes at the proxy was a second, guarded path, and this file kept the
 * list of which operations needed it. The backend is now the OAuth2 client and
 * reads its own session cookie, so it decides per field and the split is gone.
 *
 * `credentials: "same-origin"` is what attaches the session cookie.
 */
const URI = import.meta.env.VITE_API_URL ?? "/graphql";

export const client = new ApolloClient({
  link: createHttpLink({ uri: URI, credentials: "same-origin" }),
  cache: new InMemoryCache(),
});
