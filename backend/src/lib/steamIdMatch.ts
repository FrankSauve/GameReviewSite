import { titleKey } from "./gameMatch.js";
import type { GameHit } from "./gameSources/types.js";

export type SteamIdPlan =
  | { kind: "link"; hit: GameHit }
  | { kind: "choose"; hits: GameHit[] }
  | { kind: "none" };

/**
 * Proposes a Steam app for a library game by title alone: Steam's date is its
 * own release, so a year cannot confirm a console-first game. A person reads the
 * plan before anything is written, and `skips` and `picks` hold their answers.
 */
export function planSteamId(
  title: string,
  hits: GameHit[],
  { skips, picks }: { skips: Set<string>; picks: Set<string> },
): SteamIdPlan {
  const key = titleKey(title);
  const matches = hits.filter(
    (hit) => titleKey(hit.title) === key && !skips.has(hit.externalId),
  );
  const picked = matches.find((hit) => picks.has(hit.externalId));
  if (picked) return { kind: "link", hit: picked };

  const [first, ...rest] = matches;
  if (!first) return { kind: "none" };
  return rest.length === 0
    ? { kind: "link", hit: first }
    : { kind: "choose", hits: matches };
}
