/**
 * The people behind one emoji, as the hover card names them — "alice, bob and
 * 3 others".
 *
 * `usernames` is truncated by the API — see REACTOR_NAMES_MAX in
 * backend/src/lib/pagination.ts — and empty while the hover query is still in
 * flight, so `count` is what decides how many are left unnamed, never the
 * length of the list.
 */
export function describeReactors(
  usernames: readonly string[],
  count: number,
): string {
  const named = usernames.slice(0, count);
  // "3 others" only reads as such beside a name; with none it is the whole list.
  if (named.length === 0) return people(count);
  const unnamed = count - named.length;
  const parts = unnamed > 0 ? [...named, others(unnamed)] : named;
  const last = parts[parts.length - 1] ?? "";
  if (parts.length === 1) return last;
  return `${parts.slice(0, -1).join(", ")} and ${last}`;
}

function people(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

function others(n: number): string {
  return `${n} ${n === 1 ? "other" : "others"}`;
}
