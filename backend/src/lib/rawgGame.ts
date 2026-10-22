import { badInput } from "./badInput.js";
import { releaseYear, type RawgGame } from "./rawg.js";
import { TITLE_MAX } from "./gameCatalogue.js";
import { LABEL_MAX_LENGTH, validateLabels } from "./labels.js";

/** RAWG identifiers are integers; this is also what gets parsed for the detail fetch. */
export function validateRawgId(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{1,12}$/.test(trimmed))
    throw badInput("rawgId must be a positive integer.");
  return trimmed;
}

export interface RawgGameFields {
  title: string;
  coverUrl: string | null;
  genres: string[];
  releaseYear: number | null;
  description: string | null;
}

const DESCRIPTION_MAX = 20_000;

/**
 * A game row is built from RAWG's answer, never from what the client sent, so
 * an odd field is dropped rather than refused: the reviewer cannot fix it.
 */
export function gameFieldsFromRawg(detail: RawgGame): RawgGameFields | null {
  const title = detail.name.trim().slice(0, TITLE_MAX).trim();
  if (!title) return null;

  return {
    title,
    coverUrl: httpsUrl(detail.background_image),
    genres: validateLabels(
      (detail.genres ?? [])
        .map(({ name }) => name)
        .filter((name) => name.trim().length <= LABEL_MAX_LENGTH),
      "genre",
    ),
    releaseYear: releaseYear(detail.released),
    description:
      detail.description_raw?.trim().slice(0, DESCRIPTION_MAX) || null,
  };
}

/** Covers land in an <img src> on every reader's page, so only https passes. */
function httpsUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
