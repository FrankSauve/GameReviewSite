/** The message a Discord webhook gets when a review is posted. */

import {
  SITE_NAME,
  THEME_COLOR,
  embedDescription,
  embedTitle,
} from "./embed.js";
import { formatScore } from "./exportMarkdown.js";

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
    description: string;
    color: number;
    image?: { url: string };
    fields: EmbedField[];
    footer: { text: string };
    timestamp: string;
  }[];
}

export function reviewWebhookPayload(
  review: PostedReview,
  origin: string,
): WebhookPayload {
  const fields: EmbedField[] = [
    { name: "Score", value: `${formatScore(review.rating)}/10`, inline: true },
  ];
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

  const title = embedTitle(
    review.game.title,
    review.rating,
    review.user.username,
  );

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
        title:
          title.length > TITLE_MAX
            ? title.slice(0, TITLE_MAX - 1) + "…"
            : title,
        url: `${origin}/reviews/${review.slug}`,
        description: embedDescription(review.content),
        color: parseInt(THEME_COLOR.slice(1), 16),
        ...(review.game.coverUrl
          ? { image: { url: review.game.coverUrl } }
          : {}),
        fields,
        footer: { text: SITE_NAME },
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
    if (!res.ok) console.error(`Discord webhook returned ${res.status}`);
  } catch (err: unknown) {
    console.error(
      "Discord webhook failed:",
      err instanceof Error ? err.name : "unknown error",
    );
  }
}
