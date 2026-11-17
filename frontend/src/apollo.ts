import { ApolloClient, HttpLink } from "@apollo/client";
import { createCache } from "./apolloCache";

/** `credentials: "same-origin"` is what attaches the session cookie. */
const URI = import.meta.env.VITE_API_URL ?? "/graphql";

/** `loading` is also true during a refetch: gate a skeleton on `loading && !data`, or every refetch blanks the page. */
export const client = new ApolloClient({
  link: new HttpLink({ uri: URI, credentials: "same-origin" }),
  cache: createCache(),
});
