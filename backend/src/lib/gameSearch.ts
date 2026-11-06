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
  /** Listed first, and fine to lose. */
  lead?: Lookup[];
  /** Tried in order until one answers. An empty answer is an answer... */
  fallback: Lookup[];
  /** ...unless this is set, for a reader who asked to look further. */
  emptyFallsThrough?: boolean;
  /** Also asked, and fine to lose. */
  extra?: Lookup[];
}

/** A source that just failed is not awaited again: a reader would wait out its timeout. */
const SKIP_MS = 60_000;
/** Mostly for an outage, when typing lands on TheGamesDB's monthly allowance. */
const CACHE_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;
/** How long an answer waits for the lookups that are fine to lose. */
const GRACE_MS = 1000;

/** Races a promise against one shared deadline, which reads as a lost answer. */
function within(ms: number) {
  const deadline = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), ms).unref();
  });
  return <T>(promise: Promise<T>) => Promise.race([promise, deadline]);
}

export function createGameSearch(
  plans: Record<GameSearchScope, Plan>,
  now: () => number = Date.now,
  graceMs = GRACE_MS,
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
    if ((skippedUntil.get(lookup.source) ?? 0) > now()) return null;

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
      skippedUntil.set(lookup.source, now() + SKIP_MS);
      return null;
    }
  }

  async function firstAnswer(plan: Plan, query: string) {
    let answer: SourcedHit[] | null = null;
    for (const lookup of plan.fallback) {
      const hits = await ask(lookup, query);
      if (!hits) continue;
      answer = hits;
      if (hits.length > 0 || !plan.emptyFallsThrough) break;
    }
    return answer;
  }

  return {
    async search(query: string, scope: GameSearchScope): Promise<SourcedHit[]> {
      const plan = plans[scope];
      const lead = (plan.lead ?? []).map((lookup) => ask(lookup, query));
      const extra = (plan.extra ?? []).map((lookup) => ask(lookup, query));
      const main = await firstAnswer(plan, query);

      // With nothing from the main chain, these are all there is to wait for.
      const settled = main ? within(graceMs) : undefined;
      const [leads, extras] = await Promise.all([
        Promise.all(lead.map((hits) => settled?.(hits) ?? hits)),
        Promise.all(extra.map((hits) => settled?.(hits) ?? hits)),
      ]);

      const hits = [...leads, main, ...extras].flatMap((list) => list ?? []);
      if (!main && hits.length === 0)
        throw sourceUnavailable("Game search", "no source answered");
      return hits;
    },

    clear() {
      skippedUntil.clear();
      cache.clear();
    },
  };
}
