import { SourceUnavailableError } from "./http.js";
import type { GameFields } from "./types.js";

/** Fields built while the art lookup was down: cached briefly, so it is retried. */
const missedArt = new WeakSet<GameFields>();

export const artMissed = (fields: GameFields) => missedArt.has(fields);

export function withArt(fields: GameFields | null, missed: boolean) {
  if (fields && missed) missedArt.add(fields);
  return fields;
}

/**
 * Art is a nicety: an outage leaves a game without it. Any other failure is
 * ours and throws. Settles even when nobody awaits it, as for a game that
 * turns out not to exist.
 */
export function artOrNone<T>(
  lookup: Promise<T>,
  none: T,
): Promise<{ art: T; missed: boolean }> {
  const settled = lookup.then(
    (art) => ({ art, missed: false }),
    (err: unknown) => {
      if (err instanceof SourceUnavailableError)
        return { art: none, missed: true };
      throw err;
    },
  );
  settled.catch(() => undefined);
  return settled;
}
