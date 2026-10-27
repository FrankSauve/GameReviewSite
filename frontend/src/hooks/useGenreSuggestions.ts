import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { GET_USER_REVIEW_SUMMARIES } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import {
  ORDER_FOR,
  genreSuggestions,
  type ReviewSummary,
} from "../lib/grouping";

/** The genres the review form offers the signed-in reviewer for one game. */
export function useGenreSuggestions(
  gameGenres: string[] | undefined,
  communityGenres: string[] | undefined,
  communitySecondaryGenres: string[] | undefined,
): string[] {
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
  const reviews = data?.reviewSummariesByUser;
  return useMemo(
    () =>
      genreSuggestions(reviews ?? [], gameGenres ?? [], {
        genres: communityGenres ?? [],
        secondaryGenres: communitySecondaryGenres ?? [],
      }),
    [reviews, gameGenres, communityGenres, communitySecondaryGenres],
  );
}
