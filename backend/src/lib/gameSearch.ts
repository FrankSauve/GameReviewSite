import { sourceUnavailable } from "./gameSources/http.js";
import type { GameHit, GameSourceId } from "./gameSources/types.js";

export type GameSearchScope = "DEFAULT" | "EVERYWHERE";

/** One way of asking a source: Steam's games and its DLC are searched apart. */
export interface Lookup {
  name: string;
  source: GameSourceId;
  enabled?(): boolean;
  search(query: string): Promise<GameHit[]>;
}

export type SourcedHit = GameHit & { source: GameSourceId };

interface Plan {
  /** Tried in order until one answers. An empty answer is an answer. */
  fallback: Lookup[];
  /** Also asked, and fine to lose. */
  extra?: Lookup[];
}

/** A source that just failed is not awaited again: a reader would wait out its timeout. */
const SKIP_MS = 60_000;
/** Mostly for an outage, when typing lands on TheGamesDB's monthly allowance. */
const CACHE_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;

export function createGameSearch(
  plans: Record<GameSearchScope, Plan>,
  now: () => number = Date.now,
) {
  const skippedUntil = new Map<string, number>();
  const cache = new Map<string, { hits: SourcedHit[]; expires: number }>();

  /** Null when the source cannot be asked, or failed when it was. */
  async function ask(
    lookup: Lookup,
    query: string,
  ): Promise<SourcedHit[] | null> {
    const key = `${lookup.name}:${query.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.hits;

    if (lookup.enabled?.() === false) return null;
    if ((skippedUntil.get(lookup.name) ?? 0) > now()) return null;

    try {
      const found = await lookup.search(query);
      const hits = found.map((hit) => ({ ...hit, source: lookup.source }));
      cache.delete(key);
      cache.set(key, { hits, expires: now() + CACHE_MS });
      for (const oldest of cache.keys()) {
        if (cache.size <= CACHE_MAX) break;
        cache.delete(oldest);
      }
      return hits;
    } catch (err) {
      console.warn(`${lookup.name} search failed:`, err);
      skippedUntil.set(lookup.name, now() + SKIP_MS);
      return null;
    }
  }

  async function firstAnswer(lookups: Lookup[], query: string) {
    for (const lookup of lookups) {
      const hits = await ask(lookup, query);
      if (hits) return hits;
    }
    return null;
  }

  return {
    async search(query: string, scope: GameSearchScope): Promise<SourcedHit[]> {
      const plan = plans[scope];
      const [main, ...extras] = await Promise.all([
        firstAnswer(plan.fallback, query),
        ...(plan.extra ?? []).map((lookup) => ask(lookup, query)),
      ]);
      const answers = [main, ...extras].filter((hits) => hits !== null);
      if (answers.length === 0)
        throw sourceUnavailable("Game search", "every source failed");
      return answers.flat();
    },

    clear() {
      skippedUntil.clear();
      cache.clear();
    },
  };
}
