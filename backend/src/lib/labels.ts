import { badInput } from "./badInput.js";

/**
 * Duplicated as MAX_LABELS in frontend/src/pages/AddGamePage.tsx, which draws
 * the counter on the form, and once more in the backfill SQL of the
 * 20260829041559_multi_platform_genre migration (which still names this rule's
 * old home in resolvers/game.ts; an applied migration is checksummed, so it is
 * left alone). This copy is authoritative — change the form too, or it promises
 * entries the server silently drops.
 */
export const MAX_LABELS = 5;

const LABEL_MAX_LENGTH = 100;

/** Past the cap is dropped, not refused: being on many platforms is not a
 *  malformed request, and refusing it is what made Terraria unaddable. */
export function validateLabels(values: string[], field: string): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > LABEL_MAX_LENGTH)
      throw badInput(
        `Each ${field} must be at most ${LABEL_MAX_LENGTH} characters.`,
      );

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(trimmed);
    if (kept.length === MAX_LABELS) break;
  }

  return kept;
}
