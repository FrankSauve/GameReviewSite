import type { ReviewSummary } from "./grouping";

/** The shape a tile and the picker need; less than a full Game. */
export interface PickableGame {
  id: string;
  slug?: string | null;
  title: string;
  coverUrl?: string | null;
}

/**
 * The games an account may pick from: the ones it has reviewed, which the
 * profile page has already loaded for the review list.
 *
 * Deduplicated by id and sorted by title, so the picker reads as a library
 * rather than as a review history.
 */
export function pickableGames(summaries: ReviewSummary[]): PickableGame[] {
  const byId = new Map<string, PickableGame>();
  for (const summary of summaries) {
    const game = summary.game;
    if (game && !byId.has(game.id)) {
      byId.set(game.id, {
        id: game.id,
        slug: game.slug ?? null,
        title: game.title,
        coverUrl: game.coverUrl ?? null,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}
