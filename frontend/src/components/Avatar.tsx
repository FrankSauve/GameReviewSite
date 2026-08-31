import { avatarGradient } from "../lib/avatarColor";

export interface AvatarUser {
  slug?: string | null;
  username?: string | null;
  avatarColor?: string | null;
}

/** Keyed by Tailwind's width scale, so a call site reads like the class it replaces. */
const SIZES = {
  5: "w-5 h-5 text-xs font-bold",
  6: "w-6 h-6 text-xs font-bold",
  8: "w-8 h-8 text-xs font-bold",
  9: "w-9 h-9 text-sm font-bold",
  10: "w-10 h-10 text-sm font-bold",
  11: "w-11 h-11 text-base font-black",
  16: "w-16 h-16 text-2xl font-black",
} as const;

interface AvatarProps {
  user: AvatarUser | null | undefined;
  size: keyof typeof SIZES;
  className?: string;
}

/**
 * The one place an account's circle is drawn. A missing user still gets a
 * circle — a deleted author leaves its reviews and comments behind.
 */
export function Avatar({ user, size, className = "" }: AvatarProps) {
  const initial = (user?.username?.charAt(0) ?? "?").toUpperCase();
  return (
    <span
      className={`${SIZES[size]} rounded-full bg-gradient-to-br ${avatarGradient(user ?? {})} flex items-center justify-center text-white shrink-0 ${className}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
