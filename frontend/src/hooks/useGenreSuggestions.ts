import { useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { ORDER_FOR, genreSuggestions } from "../lib/grouping";
import { useReviewSummaries } from "./useReviewSummaries";

/** The genres the review form offers the signed-in reviewer for one game. */
export function useGenreSuggestions(
  gameGenres: string[] | undefined,
  communityGenres: string[] | undefined,
  communitySecondaryGenres: string[] | undefined,
): string[] {
  const { user } = useAuth();
  // The profile's own by-genre query, so a suggestion is spelled as its heading.
  // Refreshed on every mount, so a genre saved a moment ago is offered next time.
  const { data } = useReviewSummaries(user?.slug ?? user?.id, ORDER_FOR.genre, {
    skip: !user,
    fetchPolicy: "cache-and-network",
  });
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
