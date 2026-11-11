import { GraphQLError } from "graphql";

/** Readers sit waiting on this: Node's own limit on a hung upstream is minutes. */
const TIMEOUT_MS = 5000;

/** What went wrong, for logs and the operator: never sent to a reader. */
function describe(reason: unknown): string {
  if (typeof reason === "number") return `HTTP ${reason}`;
  if (reason instanceof Error) {
    const cause = reason.cause as { code?: unknown; message?: unknown } | null;
    const detail = cause?.code ?? cause?.message;
    return detail ? `${reason.message} (${String(detail)})` : reason.message;
  }
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

/**
 * Has a code in sanitizeError's CLIENT_ERROR_CODES, which is what lets the reader
 * see the message in production rather than "Internal server error."
 */
export class SourceUnavailableError extends GraphQLError {
  constructor(
    source: string,
    readonly reason: string,
  ) {
    super(`${source} is unavailable right now. Try again shortly.`, {
      extensions: { code: "SERVICE_UNAVAILABLE" },
    });
  }
}

export function sourceUnavailable(source: string, reason: unknown) {
  const described = describe(reason);
  // Never log the request URL: an API key can be in its query string.
  console.warn(`${source} unavailable:`, described);
  return new SourceUnavailableError(source, described);
}

/** A search answer must hold a list: anything else falls through, not "no results". */
export function requireList<T>(source: string, list: T[] | null | undefined) {
  if (!Array.isArray(list))
    throw sourceUnavailable(source, "answered without a list");
  return list;
}

/**
 * The parsed body, or null on a 404. An outage is theirs, as is a 403: it is how
 * Steam rate-limits and TheGamesDB refuses a spent allowance. Other failures are ours.
 */
export async function getJson<T>(
  source: string,
  url: string,
): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "GameReviews" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return (await res.json()) as T;
  } catch (err) {
    throw sourceUnavailable(source, err);
  }
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429 || res.status >= 500)
    throw sourceUnavailable(source, res.status);
  throw new Error(`${source} API returned ${res.status}`);
}
