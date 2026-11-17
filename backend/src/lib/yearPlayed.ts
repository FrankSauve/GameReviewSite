import { badInput } from "./badInput.js";

/** Mirrored in frontend/src/lib/playtime.ts for the form; this copy is authoritative. */
export const YEAR_PLAYED_MIN = 1970;

export function validateYearPlayed(year: number, field = "yearPlayed"): number {
  const num = Number(year);
  const max = new Date().getFullYear() + 1;
  if (!Number.isInteger(num) || num < YEAR_PLAYED_MIN || num > max)
    throw badInput(
      `${field} must be a whole year between ${YEAR_PLAYED_MIN} and ${max}.`,
    );
  return num;
}
