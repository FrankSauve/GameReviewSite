/**
 * djb2, for picking a stable colour from a name.
 *
 * Not a sum of char codes: a sum is order-independent, so every anagram of a
 * name draws the same colour, and short names cluster onto the same few
 * buckets. That is what #107 reported for avatars.
 */
export function seedHash(seed: string): number {
  let h = 5381;
  for (const c of seed) h = (h * 33) ^ c.charCodeAt(0);
  return Math.abs(h);
}
