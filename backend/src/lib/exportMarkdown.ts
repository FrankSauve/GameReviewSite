/**
 * Reviews as markdown, in the format the issue specifies:
 *
 *     # Game Title
 *     **Score:** 8.5
 *     **Playtime:** 42 hrs
 *     **Year played:** 2024
 *
 *     <body>
 *
 * One review per file, delivered as a zip.
 */

import { slugify } from "./slug.js";

/** `8.5` and `9`, never `9.0`. Matches how a score reads on the site.
 *  Exported for lib/embed.ts, which puts the same number in an embed title. */
export function formatScore(rating: number): string {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
}

export interface ExportableReview {
  gameTitle: string;
  rating: number;
  hoursPlayed?: number | null;
  yearPlayed?: number | null;
  content: string;
}

export function formatReview(review: ExportableReview): string {
  const lines = [
    `# ${review.gameTitle}`,
    `**Score:** ${formatScore(review.rating)}`,
  ];
  if (review.hoursPlayed != null) {
    lines.push(`**Playtime:** ${formatHoursPlayed(review.hoursPlayed)} hrs`);
  }
  if (review.yearPlayed != null) {
    lines.push(`**Year played:** ${review.yearPlayed}`);
  }
  // The blank line is what separates the metadata block from the body; without
  // it markdown reads the first line of the review as part of the bold run.
  return `${lines.join("\n")}\n\n${review.content.trim()}\n`;
}

function formatHoursPlayed(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** The archive offered to the browser, e.g. `reviews-alice.zip`. */
export function exportFilename(usernameSlug: string): string {
  return `reviews-${usernameSlug}.zip`;
}

/**
 * The directory every entry sits under, e.g. `reviews-alice/`.
 */
export function exportDirectory(usernameSlug: string): string {
  return `reviews-${usernameSlug}`;
}

/**
 * Names the file for one review, e.g. `reviews-alice/elden-ring.md`.
 */
export function reviewEntryName(
  directory: string,
  gameTitle: string,
  taken: Set<string>,
): string {
  const base = slugify(gameTitle, "review");
  let name = `${directory}/${base}.md`;
  for (let n = 2; taken.has(name); n++) {
    name = `${directory}/${base}-${n}.md`;
  }
  taken.add(name);
  return name;
}
