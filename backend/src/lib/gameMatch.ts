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
  /\s(?:(?:game of the year|goty|deluxe|digital deluxe|definitive|enhanced|ultimate|complete|gold|premium|special|collectors|legendary|anniversary|standard) edition|goty|remastered|(?:the )?final cut|directors cut)$/;

/**
 * Compares titles across sources, which punctuate and number one game
 * differently. Equal keys mean "ask", never "merge": "Doom" is two games.
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
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word) => ROMAN[word] ?? word)
    .join(" ");
  return key.replace(EDITION, "") || key;
}
