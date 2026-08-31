import { badInput } from "./badInput.js";

/**
 * The emoji column is free text to Postgres and is rendered on every review, so
 * this is the only thing keeping arbitrary strings out of it.
 */

/** Long enough for a four-person family with skin tones; nothing legitimate is longer. */
export const EMOJI_MAX_LENGTH = 64;

/**
 * `\p{RGI_Emoji}` is a properties-of-strings escape and needs the `v` flag,
 * which the ES2022 target does not accept in a literal. It matches one
 * fully-qualified RGI sequence — ZWJ joins, variation selectors, skin tones and
 * flags included — and nothing else, so `❤` without U+FE0F is refused too.
 */
const SINGLE_EMOJI = new RegExp("^\\p{RGI_Emoji}$", "v");

/** Refuses anything that is not exactly one fully-qualified emoji. */
export function validateEmoji(value: string | null | undefined): string {
  const emoji = value ?? "";
  if (!emoji) throw badInput("emoji must not be empty.");
  if (emoji.length > EMOJI_MAX_LENGTH)
    throw badInput(`emoji must be at most ${EMOJI_MAX_LENGTH} characters.`);
  if (!SINGLE_EMOJI.test(emoji))
    throw badInput("emoji must be a single emoji.");
  return emoji;
}
