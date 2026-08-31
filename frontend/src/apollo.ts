import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";

/** `credentials: "same-origin"` is what attaches the session cookie. */
const URI = import.meta.env.VITE_API_URL ?? "/graphql";

export const client = new ApolloClient({
  link: createHttpLink({ uri: URI, credentials: "same-origin" }),
  cache: new InMemoryCache(),
});
