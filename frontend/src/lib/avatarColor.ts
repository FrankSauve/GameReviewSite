/**
 * The colours an account may pick for its avatar, each with the gradient that
 * draws it. Written out in full because Tailwind scans for whole class names
 * and would not see a composed `from-${key}-600`.
 *
 * The key list is duplicated as AVATAR_COLORS in backend/src/lib/avatarColor.ts,
 * which is authoritative and refuses a write outside it.
 */
export const AVATAR_COLORS = {
  violet: "from-violet-600 to-indigo-700",
  indigo: "from-indigo-600 to-blue-700",
  blue: "from-blue-600 to-cyan-700",
  cyan: "from-cyan-600 to-sky-700",
  teal: "from-teal-600 to-emerald-700",
  emerald: "from-emerald-600 to-green-700",
  lime: "from-lime-600 to-green-700",
  amber: "from-amber-600 to-orange-700",
  orange: "from-orange-600 to-red-700",
  rose: "from-rose-600 to-pink-700",
  pink: "from-pink-600 to-fuchsia-700",
  fuchsia: "from-fuchsia-600 to-purple-700",
} as const;

export type AvatarColor = keyof typeof AVATAR_COLORS;

export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS) as AvatarColor[];

const FALLBACK: AvatarColor = "violet";

/**
 * djb2 rather than a sum of char codes: a sum collides across anagrams and
 * clusters short names onto the same few keys, which is what #107 reported.
 */
function hash(seed: string): number {
  let h = 5381;
  for (const c of seed) h = (h * 33) ^ c.charCodeAt(0);
  return Math.abs(h);
}

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
  return AVATAR_COLOR_KEYS[hash(seed) % AVATAR_COLOR_KEYS.length] ?? FALLBACK;
}

/** The Tailwind gradient stops for an avatar, ready for `bg-gradient-to-br`. */
export function avatarGradient(user: {
  slug?: string | null;
  avatarColor?: string | null;
}): string {
  return AVATAR_COLORS[avatarColor(user)];
}
