/** The server's ceiling for one page of reviewSummariesByUser (LIST_BOUNDS.reviewSummaries.max). */
export const REVIEW_SUMMARY_PAGE = 500;

/**
 * Where the next page starts, or null once the list is whole. A short page ends
 * it even if `total` says otherwise, so a stale count cannot loop forever.
 */
export function nextSummaryOffset(
  loaded: number,
  total: number,
): number | null {
  if (loaded === 0 || loaded >= total) return null;
  return loaded % REVIEW_SUMMARY_PAGE === 0 ? loaded : null;
}

/**
 * Writes one page into the accumulated list at its offset. A full page keeps
 * whatever follows it, minus anything the page now holds; a short page is the
 * end of the list, so it drops the rest.
 */
export function mergeSummaryPage<T>(
  existing: readonly T[],
  incoming: readonly T[],
  offset: number,
  limit: number,
  idOf: (item: T) => unknown,
): T[] {
  const head = [...existing.slice(0, offset), ...incoming];
  if (incoming.length < limit) return head;
  const held = new Set(head.map(idOf));
  return [
    ...head,
    ...existing
      .slice(offset + incoming.length)
      .filter((r) => !held.has(idOf(r))),
  ];
}
