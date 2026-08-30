/**
 * Kept in step with `REVIEW_CONTENT_MAX` in `backend/src/resolvers/review.ts`,
 * which is the side that enforces it. This one only stops the textarea accepting
 * a body the API would refuse.
 */
export const REVIEW_CONTENT_MAX = 20000;

/**
 * Turns a Markdown review body into plain text for a card excerpt. Strips the
 * syntax rather than rendering it: an excerpt sits inside a link, and real
 * markup there would nest a link in a link.
 *
 * Deliberately not a Markdown parser — a slightly odd excerpt beats a second
 * parser to keep in step. The authoritative copy of this rule;
 * `embedDescription` in backend/src/lib/embed.ts mirrors it.
 */
export function toPlainText(markdown: string): string {
  // Code is set aside before the spoiler pass so that a `||` typed inside it
  // cannot pair with a real marker, as it cannot in the renderer.
  const code: string[] = [];
  const stash = (body: string) => `\u0000${code.push(body) - 1}\u0000`;

  return (
    markdown
      // Fenced code blocks: keep the code, drop the fences.
      .replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, body: string) => stash(body))
      .replace(/`([^`]+)`/g, (_m, body: string) => stash(body))
      // Spoilers are redacted, not unwrapped: an excerpt is the one place the
      // hidden text must not appear. Confined to a single block, because the
      // renderer never pairs markers across a blank line either.
      .replace(/\|\|(?:(?!\n[ \t]*\n)[\s\S])+?\|\|/g, "[spoiler]")
      .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => code[Number(i)])
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
