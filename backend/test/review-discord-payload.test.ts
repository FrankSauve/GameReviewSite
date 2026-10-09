import { describe, expect, it } from "vitest";
import {
  TITLE_MAX,
  reviewWebhookPayload,
  type PostedReview,
} from "../src/lib/discord.js";

const ORIGIN = "https://reviews.example.com";

function review(overrides: Partial<PostedReview> = {}): PostedReview {
  return {
    slug: "elden-ring-alice",
    rating: 9.5,
    content: "Hard but **fair**.",
    yearPlayed: 2024,
    hoursPlayed: 120,
    platform: "PC",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    game: { title: "Elden Ring", coverUrl: "https://media.rawg.io/cover.jpg" },
    user: { username: "alice", slug: "alice" },
    ...overrides,
  };
}

describe("Discord webhook payload for a posted review", () => {
  it("is one embed card linking back to the review and its author", () => {
    expect(reviewWebhookPayload(review(), ORIGIN)).toEqual({
      username: "GameReviews",
      allowed_mentions: { parse: [] },
      embeds: [
        {
          author: { name: "alice", url: `${ORIGIN}/users/alice` },
          title: "Elden Ring — 9.5/10 by alice",
          url: `${ORIGIN}/reviews/elden-ring-alice`,
          description: "Hard but fair.",
          color: 0x8b5cf6,
          image: { url: "https://media.rawg.io/cover.jpg" },
          fields: [
            { name: "Score", value: "9.5/10", inline: true },
            { name: "Played", value: "2024", inline: true },
            { name: "Hours", value: "120", inline: true },
            { name: "Platform", value: "PC", inline: true },
          ],
          footer: { text: "GameReviews" },
          timestamp: "2026-10-01T12:00:00.000Z",
        },
      ],
    });
  });

  it("leaves out the image and the fields a review does not have", () => {
    const [embed] = reviewWebhookPayload(
      review({
        yearPlayed: null,
        hoursPlayed: null,
        platform: null,
        game: { title: "Homebrew", coverUrl: null },
      }),
      ORIGIN,
    ).embeds;
    expect(embed).not.toHaveProperty("image");
    expect(embed?.fields).toEqual([
      { name: "Score", value: "9.5/10", inline: true },
    ]);
  });

  it("redacts spoilers, as the link preview does", () => {
    const [embed] = reviewWebhookPayload(
      review({ content: "The ending: ||everyone dies||." }),
      ORIGIN,
    ).embeds;
    expect(embed?.description).toBe("The ending: [spoiler].");
  });

  it("keeps the title inside Discord's limit", () => {
    const [embed] = reviewWebhookPayload(
      review({ game: { title: "x".repeat(400), coverUrl: null } }),
      ORIGIN,
    ).embeds;
    expect(embed?.title).toHaveLength(TITLE_MAX);
  });
});
