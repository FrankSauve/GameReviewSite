import { useEffect, useState } from "react";
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
  // Pages that came back empty (the count was ahead of the rows, so asking
  // again would loop) or failed. Keyed by list as well as offset: this hook
  // outlives a change of account or order.
  const [exhausted, setExhausted] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const next = data
    ? nextSummaryOffset(
        data.reviewSummariesByUser.length,
        data.user?.reviewCount ?? 0,
      )
    : null;
  const nextKey = next == null ? null : `${id}:${order}:${next}`;
  const pending = nextKey != null && nextKey !== exhausted;

  useEffect(() => {
    if (next == null || nextKey == null || nextKey === exhausted) return;
    fetchMore({ variables: { offset: next } }).then(
      ({ data: page }) => {
        if (page.reviewSummariesByUser.length === 0) setExhausted(nextKey);
      },
      () => setFailed(nextKey),
    );
  }, [next, nextKey, exhausted, fetchMore]);

  return {
    ...result,
    complete: data != null && !pending,
    /** A later page failed; what is shown is only part of the list. */
    partial: pending && failed === nextKey,
  };
}
