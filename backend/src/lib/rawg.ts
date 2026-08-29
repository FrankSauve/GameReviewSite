const RAWG_BASE = "https://api.rawg.io/api";

export interface RawgGame {
  id: number;
  name: string;
  released?: string | null;
  background_image?: string | null;
  genres?: { name: string }[];
  platforms?: { platform: { name: string } }[];
  description_raw?: string | null;
  metacritic?: number | null;
}

function getApiKey(): string {
  const key = process.env["RAWG_API_KEY"];
  if (!key || key === "your-rawg-api-key-here") {
    throw new Error(
      "RAWG_API_KEY is not configured. Get a free key at https://rawg.io/apidocs and add it to backend/.env"
    );
  }
  return key;
}

/**
 * An in-memory cache in front of RAWG's search endpoint.
 *
 * Search is the only field that talks to RAWG on a path a visitor can drive, and
 * it does so once per debounced keystroke. Typing one game title is several
 * requests; deleting a few characters and retyping them is several more, for a
 * result the process saw seconds earlier. Against a 20,000-a-month budget —
 * roughly 460 a day, or one every three minutes sustained — that is the spend
 * worth removing.
 *
 * Ten minutes, because RAWG's catalogue does not meaningfully change inside a
 * typing session and the cache only has to survive one. The bound stops a long
 * uptime, or someone walking the keyspace, from turning this into a leak; entries
 * are evicted oldest-first, which for a cache this small is close enough to LRU
 * and costs nothing to maintain.
 *
 * Deliberately per-process. The deployment runs a single backend container, so a
 * shared cache would mean running Redis to save a few hundred requests a month.
 * If that ever stops being true this becomes a cache that helps less, not one
 * that is wrong: the entries are immutable snapshots, never authoritative state.
 */
const SEARCH_CACHE_TTL_MS = 10 * 60_000;
const SEARCH_CACHE_MAX_ENTRIES = 500;

interface CacheEntry {
  expiresAt: number;
  results: RawgGame[];
}

const searchCache = new Map<string, CacheEntry>();

/** So that "Elden  Ring", "elden ring" and " Elden Ring " are one entry. */
function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function readCache(key: string): RawgGame[] | null {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return hit.results;
}

function writeCache(key: string, results: RawgGame[]): void {
  if (searchCache.size >= SEARCH_CACHE_MAX_ENTRIES) {
    // Map iterates in insertion order, so this is the oldest entry.
    const oldest = searchCache.keys().next();
    if (!oldest.done) searchCache.delete(oldest.value);
  }
  searchCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, results });
}

/**
 * Empties the search cache.
 *
 * Exists for the tests, which need to assert on how many times RAWG was actually
 * called and would otherwise inherit whatever a previous test left behind.
 */
export function clearRawgCache(): void {
  searchCache.clear();
}

export async function searchRawg(query: string): Promise<RawgGame[]> {
  const key = cacheKey(query);
  const cached = readCache(key);
  if (cached) return cached;

  const apiKey = getApiKey();
  // query is encoded via URLSearchParams — never interpolated raw into the URL
  const params = new URLSearchParams({
    key: apiKey,
    search: query,
    page_size: "12",
    ordering: "-relevance",
  });
  const res = await fetch(`${RAWG_BASE}/games?${params.toString()}`);
  if (!res.ok) throw new Error(`RAWG API returned ${res.status}`);
  const data = (await res.json()) as { results?: RawgGame[] };
  const results = data.results ?? [];

  // Only successful responses are cached. Caching a failure would turn one bad
  // minute at RAWG into ten minutes of empty search for everybody.
  writeCache(key, results);
  return results;
}

/**
 * Not cached, unlike search.
 *
 * This is called from `importGame`, and only when the game is absent from the
 * database or is there without a description — so a second call for the same id
 * means the first one's result was already written to Postgres, which is the
 * durable cache. A TTL map in front of it would be a second copy of a row that
 * is now read from the database anyway.
 */
export async function getRawgGame(rawgId: number): Promise<RawgGame> {
  const key = getApiKey();
  const params = new URLSearchParams({ key });
  const res = await fetch(`${RAWG_BASE}/games/${rawgId}?${params.toString()}`);
  if (!res.ok) throw new Error(`RAWG API returned ${res.status}`);
  return (await res.json()) as RawgGame;
}

export function releaseYear(released?: string | null): number | null {
  if (!released) return null;
  const y = parseInt(released.split("-")[0], 10);
  return isNaN(y) ? null : y;
}
