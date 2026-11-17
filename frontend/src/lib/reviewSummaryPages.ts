/** What each page asks for. The server may clamp it lower; that only costs pages. */
export const REVIEW_SUMMARY_PAGE = 500;

/**
 * Where the next page starts, or null once the list is whole. Judged by the
 * count, never by page size, which the server owns.
 */
export function nextSummaryOffset(
  loaded: number,
  total: number,
): number | null {
  return loaded > 0 && loaded < total ? loaded : null;
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
