/**
 * The HTML stub crawlers get for a review link.
 *
 * The site is a static SPA: the markup nginx serves is an empty `<div id="root">`
 * and every word on the page arrives later, from JavaScript. Discord, Slack,
 * Mastodon and the rest do not run JavaScript, so a pasted review currently
 * unfurls into nothing at all. Meta tags therefore have to be *served*, which
 * means they have to come from the backend — see routes/embed.ts for how a
 * crawler is routed here while a person still gets the SPA.
 *
 * Everything in this module is pure so that the tags themselves can be tested
 * without a database or a socket.
 */

import { formatScore } from "./exportMarkdown.js";

/** Roughly two lines in a Discord embed before it is truncated for us. */
export const DESCRIPTION_MAX = 300;

/** The violet the site's own UI is built around; Discord paints the embed's
 *  left stripe with it. */
export const THEME_COLOR = "#8b5cf6";

export const SITE_NAME = "GameReviews";

/**
 * Escapes text for use in an HTML attribute or text node.
 *
 * Every value below reaches this page from something a person typed — a game
 * title imported from RAWG, a username from authentik, a review body — and lands
 * inside a double-quoted `content="…"`. A single unescaped quote would end the
 * attribute and let the rest of the title write tags of its own.
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
 * Mirrors `toPlainText`/`excerpt` in frontend/src/lib/markdown.ts, including its
 * spoiler redaction: an unfurl is the one place a spoiler is most likely to be
 * read by someone who did not ask for it, and it is the one place with no
 * click-to-reveal to hide behind. Duplicated rather than shared because the two
 * live in separate packages and this one only has to handle the constructs the
 * renderer allows.
 */
export function embedDescription(markdown: string, limit = DESCRIPTION_MAX): string {
  const text = markdown
    // Spoilers first: the markers are stripped by the emphasis rules below, and
    // a redaction that runs after them would have nothing left to match.
    .replace(/\|\|[\s\S]+?\|\|/g, "[spoiler]")
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
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
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** `Elden Ring — 9.5/10 by alice`. The score belongs in the title because that
 *  is the line every client renders, however little room it gives the rest. */
export function embedTitle(gameTitle: string, rating: number, username: string): string {
  return `${gameTitle} — ${formatScore(rating)}/10 by ${username}`;
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

/**
 * The whole document. Small on purpose: a crawler reads `<head>` and stops, and
 * the body exists only for the rare person who arrives here with a user agent
 * that looks like a bot.
 */
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

/** The stub for a link to a review that is not there — deleted, or a slug typed
 *  wrong. Still an embed: a client that unfurls it should say so rather than
 *  showing the raw URL as if the fetch had failed. */
export function renderMissingEmbed(url: string): string {
  return renderReviewEmbed({
    title: `Review not found — ${SITE_NAME}`,
    description: "This review does not exist, or it has been deleted.",
    url,
  });
}

/** The stub for a request this app could not answer. Distinct from the missing
 *  one because "gone" and "broken" are different facts, and a crawler that
 *  caches the wrong one of them is wrong for a long time. */
export function renderUnavailableEmbed(url: string): string {
  return renderReviewEmbed({
    title: `Review unavailable — ${SITE_NAME}`,
    description: "This review could not be loaded right now.",
    url,
  });
}
