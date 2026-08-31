/**
 * The HTML stub crawlers get for a review link. See routes/embed.ts for how a
 * crawler is routed here while a person still gets the SPA.
 */

import { formatScore } from "./exportMarkdown.js";

/** Roughly two lines in a Discord embed before it is truncated for us. */
export const DESCRIPTION_MAX = 300;

/** The violet the site's own UI is built around; Discord paints the embed's
 *  left stripe with it. */
export const THEME_COLOR = "#8b5cf6";

export const SITE_NAME = "GameReviews";

/**
 * Escapes text for an HTML attribute or text node. Every value on this page is
 * user-supplied and lands inside a double-quoted `content="…"`.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A review body reduced to one line of plain text for `og:description`.
 *
 * Must stay in step with `toPlainText`/`excerpt` in frontend/src/lib/markdown.ts,
 * the authoritative copy. Spoilers are redacted, not unwrapped: an unfurl has no
 * click-to-reveal to hide behind.
 */
export function embedDescription(
  markdown: string,
  limit = DESCRIPTION_MAX,
): string {
  // Code is set aside before the spoiler pass so that a `||` typed inside it
  // cannot pair with a real marker, as it cannot in the renderer.
  const code: string[] = [];
  const stash = (body: string) => `\u0000${code.push(body) - 1}\u0000`;

  const text = markdown
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, body: string) => stash(body))
    .replace(/`([^`]+)`/g, (_m, body: string) => stash(body))
    // Confined to a single block, because the renderer never pairs markers
    // across a blank line either.
    .replace(/\|\|(?:(?!\n[ \t]*\n)[\s\S])+?\|\|/g, "[spoiler]")
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => code[Number(i)] ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+[.)]\s+/gm, "")
    .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return (
    (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…"
  );
}

/** `Elden Ring — 9.5/10`. The score belongs in the title because that is the
 *  line every client renders, however little room it gives the rest. */
export function embedTitle(gameTitle: string, rating: number): string {
  return `${gameTitle} — ${formatScore(rating)}/10`;
}

export interface ReviewEmbed {
  title: string;
  description: string;
  /** The canonical URL of the review on the site, absolute. */
  url: string;
  /** The game's cover, absolute and on RAWG's CDN. Absent for a game added by
   *  hand, in which case no image tag is emitted at all — an `og:image` pointing
   *  at nothing makes some clients drop the whole embed. */
  imageUrl?: string | null;
}

function tag(attr: "property" | "name", key: string, value: string): string {
  return `    <meta ${attr}="${key}" content="${escapeHtml(value)}">`;
}

/** The whole document. The body is only for a person whose user agent was
 *  mistaken for a bot; a crawler reads `<head>` and stops. */
export function renderReviewEmbed(embed: ReviewEmbed): string {
  const lines = [
    tag("property", "og:type", "article"),
    tag("property", "og:site_name", SITE_NAME),
    tag("property", "og:title", embed.title),
    tag("property", "og:description", embed.description),
    tag("property", "og:url", embed.url),
  ];

  if (embed.imageUrl) {
    lines.push(tag("property", "og:image", embed.imageUrl));
    lines.push(tag("property", "og:image:alt", embed.title));
    // summary_large_image only makes sense when there is an image to make large.
    lines.push(tag("name", "twitter:card", "summary_large_image"));
  } else {
    lines.push(tag("name", "twitter:card", "summary"));
  }

  lines.push(tag("name", "twitter:title", embed.title));
  lines.push(tag("name", "twitter:description", embed.description));
  lines.push(tag("name", "description", embed.description));
  lines.push(tag("name", "theme-color", THEME_COLOR));

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(embed.title)}</title>
    <link rel="canonical" href="${escapeHtml(embed.url)}">
${lines.join("\n")}
  </head>
  <body>
    <h1>${escapeHtml(embed.title)}</h1>
    <p>${escapeHtml(embed.description)}</p>
    <p><a href="${escapeHtml(embed.url)}">Read the review on ${SITE_NAME}</a></p>
  </body>
</html>
`;
}

/** Deleted, or a slug typed wrong. Still an embed, so a client says so rather
 *  than showing the raw URL as if the fetch had failed. */
export function renderMissingEmbed(url: string): string {
  return renderReviewEmbed({
    title: `Review not found — ${SITE_NAME}`,
    description: "This review does not exist, or it has been deleted.",
    url,
  });
}

/** Distinct from the missing stub: a crawler that caches "gone" for "broken"
 *  is wrong for a long time. */
export function renderUnavailableEmbed(url: string): string {
  return renderReviewEmbed({
    title: `Review unavailable — ${SITE_NAME}`,
    description: "This review could not be loaded right now.",
    url,
  });
}
