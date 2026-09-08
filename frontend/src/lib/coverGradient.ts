/**
 * The placeholder a game with no cover art gets, picked from its title so the
 * same game always draws the same one.
 *
 * Written out in full because Tailwind scans for whole class names and would
 * not see a composed `from-${hue}-900`.
 */
const GRADIENTS: [string, ...string[]] = [
  "from-violet-900 via-indigo-900 to-gray-900",
  "from-rose-900 via-pink-900 to-gray-900",
  "from-emerald-900 via-teal-900 to-gray-900",
  "from-blue-900 via-cyan-900 to-gray-900",
  "from-amber-900 via-orange-900 to-gray-900",
  "from-fuchsia-900 via-purple-900 to-gray-900",
];

export function titleGradient(title: string): string {
  const idx =
    [...title].reduce((acc, c) => acc + c.charCodeAt(0), 0) % GRADIENTS.length;
  return GRADIENTS[idx] ?? GRADIENTS[0];
}
