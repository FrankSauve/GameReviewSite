/**
 * Kept in step with `REVIEW_CONTENT_MAX` in `backend/src/resolvers/review.ts`,
 * which is the side that enforces it. This one only stops the textarea accepting
 * a body the API would refuse.
 */
export const REVIEW_CONTENT_MAX = 20000;

/**
 * Turns a Markdown review body into plain text for a card excerpt.
 *
 * Card excerpts used to `slice(0, 180)` the stored text, which was fine while
 * that text was plain and shows raw `**`, `#` and `[label](url)` the moment it is
 * not. This strips the syntax rather than rendering it, because an excerpt is one
 * line inside a link and nesting real markup there would put a link inside a link.
 *
 * Deliberately not a Markdown parser. It handles the constructs the renderer
 * allows and leaves anything stranger as-is, on the grounds that a slightly odd
 * excerpt is a much smaller problem than a second parser to keep in step with the
 * first.
 */
export function toPlainText(markdown: string): string {
  return (
    markdown
      // Fenced code blocks: keep the code, drop the fences.
      .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      // Links and any images that predate the renderer's element list.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Emphasis. Bold before italic, so ** is not read as two single markers.
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      // Leading block markers: headings, quotes, list bullets, numbered items.
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}[-*+]\s+/gm, "")
      .replace(/^\s{0,3}\d+[.)]\s+/gm, "")
      // Horizontal rules, which would otherwise leave a run of dashes.
      .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, "")
      // Any run of whitespace becomes one space: an excerpt is a single line.
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** A single-line excerpt of at most `limit` characters, broken on a word. */
export function excerpt(markdown: string, limit = 180): string {
  const text = toPlainText(markdown);
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
