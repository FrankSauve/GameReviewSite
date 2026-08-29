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
 * The point of the export is longevity — a file that is still readable when this
 * site is not — so it is plain text with no wrapper format, no front matter and
 * no identifiers. Nothing here is designed to be parsed back in; #39, which was
 * going to read it, is closed.
 */

/** `8.5` and `9`, never `9.0`. Matches how a score reads on the site. */
function formatScore(rating: number): string {
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
 * One review as its own section.
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

/**
 * The separator between two reviews.
 *
 * A blank line on either side of the rule is load-bearing. A body that ends
 * without one turns `---` into a setext underline, which silently promotes that
 * last paragraph to a heading — the sort of corruption nobody notices until they
 * are reading the file years later.
 */
export const REVIEW_SEPARATOR = "\n---\n\n";

/** The filename offered to the browser, e.g. `reviews-alice.md`. */
export function exportFilename(usernameSlug: string): string {
  return `reviews-${usernameSlug}.md`;
}
