/** The message a Discord webhook gets when a review is posted. */

import {
  SITE_NAME,
  THEME_COLOR,
  embedDescription,
  embedTitle,
  truncate,
} from "./embed.js";

/** Discord rejects the whole message, not just the field, past this. */
export const TITLE_MAX = 256;

export interface PostedReview {
  slug: string;
  rating: number;
  content: string;
  yearPlayed: number | null;
  hoursPlayed: number | null;
  platform: string | null;
  createdAt: Date;
  game: { title: string; coverUrl: string | null };
  user: { username: string; slug: string };
}

interface EmbedField {
  name: string;
  value: string;
  inline: true;
}

export interface WebhookPayload {
  username: string;
  allowed_mentions: { parse: [] };
  embeds: {
    author: { name: string; url: string };
    title: string;
    url: string;
    description?: string;
    color: number;
    image?: { url: string };
    fields: EmbedField[];
    timestamp: string;
  }[];
}

export function reviewWebhookPayload(
  review: PostedReview,
  origin: string,
): WebhookPayload {
  const fields: EmbedField[] = [];
  if (review.yearPlayed !== null)
    fields.push({
      name: "Played",
      value: String(review.yearPlayed),
      inline: true,
    });
  if (review.hoursPlayed !== null)
    fields.push({
      name: "Hours",
      value: String(review.hoursPlayed),
      inline: true,
    });
  if (review.platform)
    fields.push({ name: "Platform", value: review.platform, inline: true });

  // Discord refuses an empty description, which a body of only an image yields.
  const description = embedDescription(review.content);

  return {
    username: SITE_NAME,
    // Titles and usernames are user-supplied; an `@everyone` in one must not ping.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author: {
          name: review.user.username,
          url: `${origin}/users/${review.user.slug}`,
        },
        title: truncate(
          embedTitle(review.game.title, review.rating, review.user.username),
          TITLE_MAX,
        ),
        url: `${origin}/reviews/${review.slug}`,
        ...(description ? { description } : {}),
        color: parseInt(THEME_COLOR.slice(1), 16),
        ...(review.game.coverUrl
          ? { image: { url: review.game.coverUrl } }
          : {}),
        fields,
        timestamp: review.createdAt.toISOString(),
      },
    ],
  };
}

/**
 * Posts to DISCORD_WEBHOOK_URL, if set. Never throws: a broken webhook must not
 * fail the review. Never logs the URL either, because it carries the token.
 */
export async function notifyReviewPosted(
  review: PostedReview,
  origin: string,
): Promise<void> {
  const url = (process.env["DISCORD_WEBHOOK_URL"] ?? "").trim();
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reviewWebhookPayload(review, origin)),
      signal: AbortSignal.timeout(5000),
    });
    // Unread, the body holds the connection until it is garbage collected.
    await res.body?.cancel();
    if (!res.ok) console.error(`Discord webhook returned ${res.status}`);
  } catch (err: unknown) {
    console.error(
      "Discord webhook failed:",
      err instanceof Error ? err.name : "unknown error",
    );
  }
}
