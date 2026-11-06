const ROMAN: Record<string, string> = {
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*\((?:19|20)\d{2}\)\s*$/, "")
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .map((word) => ROMAN[word] ?? word)
    .join(" ");
  // A title of punctuation alone has no key, and must not match every other such.
  return key.replace(EDITION, "") || key || title.trim();
}

interface Titled {
  title: string;
  releaseYear: number | null;
}

/** Ports drift a year; a missing year cannot rule a match out, so it asks. */
export function mightBeSameGame(a: Titled, b: Titled): boolean {
  if (titleKey(a.title) !== titleKey(b.title)) return false;
  if (a.releaseYear === null || b.releaseYear === null) return true;
  return Math.abs(a.releaseYear - b.releaseYear) <= 1;
}
