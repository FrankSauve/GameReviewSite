import { InMemoryCache, type Reference } from "@apollo/client";
import { mergeSummaryPage } from "./lib/reviewSummaryPages";

/** The app's cache. Tests that page through reviews build theirs from this too. */
export function createCache(): InMemoryCache {
  return new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          // One list per user and order, filled a page at a time by offset.
          reviewSummariesByUser: {
            keyArgs: ["userId", "order"],
            merge(
              existing: readonly Reference[] | undefined,
              incoming: readonly Reference[],
              { args, readField },
            ) {
              const offset =
                typeof args?.["offset"] === "number" ? args["offset"] : 0;
              const limit =
                typeof args?.["limit"] === "number"
                  ? args["limit"]
                  : incoming.length;
              return mergeSummaryPage(
                existing ?? [],
                incoming,
                offset,
                limit,
                (r) => readField("id", r),
              );
            },
          },
        },
      },
    },
  });
}
