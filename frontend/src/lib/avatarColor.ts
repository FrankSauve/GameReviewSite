import { seedHash } from "./hash";

/**
 * The colours an account may pick for its avatar, each with the class that
 * draws its gradient. The stops live on --avatar-* in the token layer, so a
 * palette can restate them; written out in full because Tailwind scans for
 * whole class names and would not see a composed `avatar-${key}`.
 *
 * The key list is duplicated as AVATAR_COLORS in backend/src/lib/avatarColor.ts,
 * which is authoritative and refuses a write outside it.
 */
export const AVATAR_COLORS = {
  violet: "avatar-violet",
  indigo: "avatar-indigo",
  blue: "avatar-blue",
  cyan: "avatar-cyan",
  teal: "avatar-teal",
  emerald: "avatar-emerald",
  lime: "avatar-lime",
  amber: "avatar-amber",
  orange: "avatar-orange",
  rose: "avatar-rose",
  pink: "avatar-pink",
  fuchsia: "avatar-fuchsia",
} as const;

export type AvatarColor = keyof typeof AVATAR_COLORS;

export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS) as AvatarColor[];

const FALLBACK: AvatarColor = "violet";

/**
 * The account's own colour, or one derived from its slug while it has not
 * picked. Seeded by slug, not username: authentik may rename a username, and
 * a colour that changes under a user is the other half of #107.
 */
export function avatarColor(user: {
  slug?: string | null;
  avatarColor?: string | null;
}): AvatarColor {
  const chosen = user.avatarColor;
  if (chosen && chosen in AVATAR_COLORS) return chosen as AvatarColor;
  const seed = user.slug;
  if (!seed) return FALLBACK;
  return (
    AVATAR_COLOR_KEYS[seedHash(seed) % AVATAR_COLOR_KEYS.length] ?? FALLBACK
  );
}

/** The class that paints an avatar's gradient. */
export function avatarGradient(user: {
  slug?: string | null;
  avatarColor?: string | null;
}): string {
  return AVATAR_COLORS[avatarColor(user)];
}
