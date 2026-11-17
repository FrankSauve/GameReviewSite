import { useEffect } from "react";
import { useQuery } from "@apollo/client/react";
import { GET_USER_REVIEW_SUMMARIES } from "../graphql/queries";
import type { Grouping, ORDER_FOR, ReviewSummary } from "../lib/grouping";
import {
  REVIEW_SUMMARY_PAGE,
  nextSummaryOffset,
} from "../lib/reviewSummaryPages";

export interface ReviewSummariesData {
  user: {
    id: string;
    slug?: string | null;
    username: string;
    avatarColor?: string | null;
    bio?: string | null;
    reviewCount: number;
    averageRating?: number | null;
    hoursPlayed?: number | null;
  } | null;
  reviewSummariesByUser: ReviewSummary[];
}

interface Options {
  skip?: boolean;
  fetchPolicy?: "cache-first" | "cache-and-network";
}

/**
 * Every review summary of one account, fetched a page at a time; each page
 * lands in one cache list (see apolloCache.ts). `complete` is false while
 * pages remain.
 */
export function useReviewSummaries(
  id: string | undefined,
  order: (typeof ORDER_FOR)[Grouping],
  { skip = false, fetchPolicy = "cache-first" }: Options = {},
) {
  const result = useQuery<ReviewSummariesData>(GET_USER_REVIEW_SUMMARIES, {
    variables: { id, order, limit: REVIEW_SUMMARY_PAGE, offset: 0 },
    skip: skip || !id,
    fetchPolicy,
  });
  const { data, fetchMore } = result;
  const next = data
    ? nextSummaryOffset(
        data.reviewSummariesByUser.length,
        data.user?.reviewCount ?? 0,
      )
    : null;

  useEffect(() => {
    if (next != null) void fetchMore({ variables: { offset: next } });
  }, [next, fetchMore]);

  return { ...result, complete: data != null && next == null };
}
