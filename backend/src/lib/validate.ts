import { badInput } from "./badInput.js";

/**
 * Trims a caller-supplied string and refuses it if it is empty or too long.
 *
 * `maxLength` is required, never defaulted, so the limit is readable at the
 * call site. A null is an empty value here, not an internal error — resolvers
 * skip on `undefined` before calling.
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
