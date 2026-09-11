import { validateChoice } from "./validate.js";

/**
 * The colours an account may pick for its avatar.
 *
 * Duplicated as AVATAR_COLORS in frontend/src/lib/avatarColor.ts, which pairs
 * each key with the gradient that draws it; this copy is authoritative and is
 * the one that refuses a write.
 */
export const AVATAR_COLORS = [
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "emerald",
  "lime",
  "amber",
  "orange",
  "rose",
  "pink",
  "fuchsia",
] as const;

const KNOWN = new Set<string>(AVATAR_COLORS);

/** Null clears the choice, which puts the account back on the slug fallback. */
export function validateAvatarColor(value: string | null): string | null {
  return validateChoice(value, KNOWN, "avatarColor", "colours");
}
