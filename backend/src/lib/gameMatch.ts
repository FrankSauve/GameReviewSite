/** Not x, which names Mega Man X rather than numbering it. */
const ROMAN: Record<string, string> = {
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
};

/** A release of a game rather than another game. Applied once, at the end. */
const EDITION =
  /\s(?:(?:game of the year|goty|deluxe|digital deluxe|definitive|enhanced|ultimate|complete|gold|premium|special|collectors|legendary|anniversary|standard) edition|goty|remastered|(?:the )?(?:final|directors) cut)$/;

/**
 * Compares titles across sources, which punctuate and number one game
 * differently. Across sources, equal keys mean "ask": "Doom" is two games.
 */
export function titleKey(title: string): string {
  const key = title
    .replace(/[™®©]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*\((?:19|20)\d{2}\)\s*$/, "")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .map((word, index) => (index > 0 ? (ROMAN[word] ?? word) : word))
    .join(" ");
  // A title of punctuation alone has no key, and must not match every other such.
  return key.replace(EDITION, "") || key || title.trim();
}

interface Titled {
  title: string;
  releaseYear: number | null;
}

/** Past a year's port drift; a missing year cannot rule a game out, so it ranks last. */
const UNKNOWN_YEAR = 1.5;

function yearGap(a: Titled, b: Titled): number {
  if (a.releaseYear === null || b.releaseYear === null) return UNKNOWN_YEAR;
  return Math.abs(a.releaseYear - b.releaseYear);
}

/** The game with this title closest in year, among those that might be the same one. */
export function closestGame<T extends Titled>(
  target: Titled,
  games: T[],
): T | null {
  const key = titleKey(target.title);
  let best: T | null = null;
  for (const game of games) {
    if (titleKey(game.title) !== key) continue;
    const gap = yearGap(target, game);
    if (gap > UNKNOWN_YEAR) continue;
    if (!best || gap < yearGap(target, best)) best = game;
  }
  return best;
}
