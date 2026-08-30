import { badInput } from "./badInput.js";

/**
 * Trims a caller-supplied string and refuses it if it is empty or too long.
 *
 * `maxLength` is required rather than defaulted: four resolvers used to hold a
 * copy of this function, each with its own default, and a reader had to know
 * which copy was in scope to know what the limit was.
 *
 * Accepts null because every optional input field is nullable in the schema, so
 * a client can send an explicit null as well as omit the field. Omission is the
 * caller's business — each resolver skips on `undefined` — but a null that
 * reaches here is an empty value, not an internal error.
 */
export function validateString(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw badInput(`${field} must not be empty.`);
  if (trimmed.length > maxLength)
    throw badInput(`${field} must be at most ${maxLength} characters.`);
  return trimmed;
}
