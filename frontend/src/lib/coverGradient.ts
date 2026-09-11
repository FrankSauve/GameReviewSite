import { seedHash } from "./hash";

/**
 * The placeholder a game with no cover art gets, picked from its title so the
 * same game always draws the same one. Each class reads its stops from
 * --cover-N in the token layer and fades into the palette's own surface, so a
 * light palette does not fade art into near-black.
 *
 * Written out in full because Tailwind scans for whole class names and would
 * not see a composed `cover-${idx}`.
 */
const GRADIENTS: [string, ...string[]] = [
  "cover-0",
  "cover-1",
  "cover-2",
  "cover-3",
  "cover-4",
  "cover-5",
];

export function titleGradient(title: string): string {
  const idx = seedHash(title) % GRADIENTS.length;
  return GRADIENTS[idx] ?? GRADIENTS[0];
}
