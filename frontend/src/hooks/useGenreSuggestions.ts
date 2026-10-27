import { useQuery } from "@apollo/client/react";
import { GET_USER_REVIEW_SUMMARIES } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import {
  ORDER_FOR,
  genreSuggestions,
  type ReviewSummary,
} from "../lib/grouping";

/** The genres the review form offers for the signed-in reviewer, theirs first. */
export function useGenreSuggestions(gameGenres: string[]): string[] {
  const { user } = useAuth();
  // The profile's own by-genre query, so a suggestion is spelled as its heading.
  // Refreshed on every mount, so a genre saved a moment ago is offered next time.
  const { data } = useQuery<{ reviewSummariesByUser: ReviewSummary[] }>(
    GET_USER_REVIEW_SUMMARIES,
    {
      variables: { id: user?.slug ?? user?.id, order: ORDER_FOR.genre },
      skip: !user,
      fetchPolicy: "cache-and-network",
    },
  );
  return genreSuggestions(data?.reviewSummariesByUser ?? [], gameGenres);
}
