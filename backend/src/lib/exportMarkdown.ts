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
 * The point of the export is longevity — files that are still readable when this
 * site is not — so it is plain text with no wrapper format, no front matter and
 * no identifiers. Nothing here is designed to be parsed back in; #39, which was
 * going to read it, is closed.
 *
 * One review per file, delivered as a zip. A single concatenated file made the
 * archive one blob to re-split by hand before any of it could be filed, edited
 * or moved somewhere else.
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
  /** Null for the rows that predate the column, and for imports without one. */
  hoursPlayed?: number | null;
  /** Null for the same reason. */
  yearPlayed?: number | null;
  content: string;
}

/**
 * One review as its own file.
 *
 * A missing playtime or year drops its line rather than writing "unknown": a
 * person reading this file later should not have to decide whether a zero means
 * "no time" or "no record".
 */
export function formatReview(review: ExportableReview): string {
  const lines = [`# ${review.gameTitle}`, `**Score:** ${formatScore(review.rating)}`];
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
 *
 * `unzip` on the command line extracts into the working directory, so a flat
 * archive scatters a backlog's worth of loose files across whatever the user
 * happened to be standing in.
 */
export function exportDirectory(usernameSlug: string): string {
  return `reviews-${usernameSlug}`;
}

/**
 * Names the file for one review, e.g. `reviews-alice/elden-ring.md`.
 *
 * `taken` carries the names already used by this archive and is added to here.
 * Two entries of the same name is a zip an extractor may unpack as one file, and
 * the same game slug can reappear: a title that reduces to the same slug as
 * another, or the same game reviewed twice after a re-slug.
 */
export function reviewEntryName(
  directory: string,
  gameTitle: string,
  taken: Set<string>
): string {
  const base = slugify(gameTitle, "review");
  let name = `${directory}/${base}.md`;
  for (let n = 2; taken.has(name); n++) {
    name = `${directory}/${base}-${n}.md`;
  }
  taken.add(name);
  return name;
}
