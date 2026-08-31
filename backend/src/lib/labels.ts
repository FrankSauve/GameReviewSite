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

export const LABEL_MAX_LENGTH = 100;

/** Trim, drop blanks, drop case-insensitive repeats, keep the first MAX_LABELS. */
function normalize(
  values: string[],
  tooLong: (value: string) => void,
): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > LABEL_MAX_LENGTH) {
      tooLong(trimmed);
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(trimmed);
    if (kept.length === MAX_LABELS) break;
  }

  return kept;
}

/** Past the cap is dropped, not refused: being on many platforms is not a
 *  malformed request, and refusing it is what made Terraria unaddable. */
export function validateLabels(values: string[], field: string): string[] {
  return normalize(values, () => {
    throw badInput(
      `Each ${field} must be at most ${LABEL_MAX_LENGTH} characters.`,
    );
  });
}

/**
 * The stored labels first, then whatever `incoming` adds. Null unless the result
 * is strictly longer than what is stored, so a curated list is never reordered,
 * shortened, or overwritten by an import.
 */
export function mergeLabels(
  existing: string[],
  incoming: string[],
): string[] | null {
  const merged = normalize([...existing, ...incoming], () => {});
  return merged.length > existing.length ? merged : null;
}
