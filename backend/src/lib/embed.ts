/**
 * The HTML stub crawlers get for a review link. See routes/embed.ts for how a
 * crawler is routed here while a person still gets the SPA.
 *
 * Pure, so the tags can be tested without a database or a socket.
 */

import { excerpt } from "@gamereviews/shared";

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
 * The rule itself is @gamereviews/shared's, because the frontend renders card
 * excerpts from it too and a spoiler that leaks in one leaks in both. Only the
 * default length is this side's: an unfurl gets about two lines.
 */
export function embedDescription(markdown: string, limit = DESCRIPTION_MAX): string {
  return excerpt(markdown, limit);
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
