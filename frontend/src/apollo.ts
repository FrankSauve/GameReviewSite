import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";

const httpLink = createHttpLink({
  uri: import.meta.env.VITE_API_URL ?? "http://localhost:4000/graphql",
});

const authLink = setContext((_, prevContext: Record<string, unknown>) => {
  const token = localStorage.getItem("gamereviews-token");
  const headers = (prevContext["headers"] as Record<string, string> | undefined) ?? {};
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
});

export const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
