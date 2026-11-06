import { TITLE_MAX } from "../gameCatalogue.js";
import { LABEL_MAX_LENGTH, validateLabels } from "../labels.js";
import type { GameFields } from "./types.js";

const DESCRIPTION_MAX = 20_000;

export function yearOf(date?: string | null): number | null {
  if (!date) return null;
  const year = parseInt(date.split("-")[0] ?? "", 10);
  return isNaN(year) ? null : year;
}

/**
 * Covers land in an <img src> on every reader's page, so only https passes, and
 * only from a host the CSP's img-src names: any other fails silently there.
 */
export function coverUrl(
  value: string | null | undefined,
  hosts: readonly string[],
): string | null {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && hosts.includes(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * A game row is built from the source's answer, never from what the client sent,
 * so an odd field is dropped rather than refused: the reviewer cannot fix it.
 */
export function gameFields(fields: GameFields): GameFields | null {
  const title = fields.title.trim().slice(0, TITLE_MAX).trim();
  if (!title) return null;

  return {
    title,
    coverUrl: fields.coverUrl,
    genres: validateLabels(
      fields.genres.filter((name) => name.trim().length <= LABEL_MAX_LENGTH),
      "genre",
    ),
    releaseYear: fields.releaseYear,
    description: fields.description?.trim().slice(0, DESCRIPTION_MAX) || null,
  };
}
