import { EMOJI_DATA } from "./emojiData";

export interface Emoji {
  char: string;
  name: string;
}

/**
 * The row every review and comment shows before anyone has reacted. Each one is
 * fully qualified — ❤️ carries U+FE0F — because the server only accepts RGI
 * sequences. See backend/src/lib/emoji.ts.
 */
export const DEFAULT_REACTIONS: readonly string[] = [
  "👍",
  "👎",
  "❤️",
  "😂",
  "😢",
  "😠",
];

const ALL: readonly Emoji[] = EMOJI_DATA.map(([char, name]) => ({
  char,
  name,
}));

/**
 * Every emoji whose Unicode name contains all of the query's words, in dataset
 * order. An empty query is every emoji, which is what the picker opens on.
 */
export function searchEmoji(query: string): readonly Emoji[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return ALL;
  return ALL.filter(
    (emoji) =>
      emoji.char === query || terms.every((term) => emoji.name.includes(term)),
  );
}
