import { GraphQLError } from "graphql";

const RAWG_BASE = "https://api.rawg.io/api";
/** Readers sit waiting on this: Node's own limit on a hung upstream is minutes. */
const RAWG_TIMEOUT_MS = 5000;

export interface RawgGame {
  id: number;
  name: string;
  released?: string | null;
  background_image?: string | null;
  genres?: { name: string }[];
  platforms?: { platform: { name: string } }[];
  description_raw?: string | null;
  metacritic?: number | null;
}

function getApiKey(): string {
  const key = process.env["RAWG_API_KEY"];
  if (!key || key === "your-rawg-api-key-here") {
    throw new Error(
      "RAWG_API_KEY is not configured. Get a free key at https://rawg.io/apidocs and add it to backend/.env",
    );
  }
  return key;
}

/**
 * Has a code in sanitizeError's CLIENT_ERROR_CODES, which is what lets the reader
 * see this in production rather than "Internal server error."
 */
function rawgUnavailable(reason: unknown): GraphQLError {
  // Never log the request URL: the API key is in its query string.
  console.warn("RAWG unavailable:", reason);
  return new GraphQLError("RAWG is unavailable right now. Try again shortly.", {
    extensions: { code: "SERVICE_UNAVAILABLE" },
  });
}

/** The parsed body, or null on a 404. An outage is RAWG's; other failures are ours. */
async function rawgGet<T>(
  path: string,
  params: URLSearchParams,
): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${RAWG_BASE}${path}?${params.toString()}`, {
      signal: AbortSignal.timeout(RAWG_TIMEOUT_MS),
    });
    if (res.ok) return (await res.json()) as T;
  } catch (err) {
    throw rawgUnavailable(err instanceof Error ? err.message : err);
  }
  if (res.status === 404) return null;
  if (res.status === 429 || res.status >= 500)
    throw rawgUnavailable(res.status);
  throw new Error(`RAWG API returned ${res.status}`);
}

export async function searchRawg(query: string): Promise<RawgGame[]> {
  const key = getApiKey();
  // query is encoded via URLSearchParams — never interpolated raw into the URL
  const params = new URLSearchParams({
    key,
    search: query,
    page_size: "12",
    ordering: "-relevance",
  });
  const data = await rawgGet<{ results?: RawgGame[] }>("/games", params);
  return data?.results ?? [];
}

/** Null when RAWG has no game under that id; any other failure throws. */
export async function getRawgGame(rawgId: number): Promise<RawgGame | null> {
  const key = getApiKey();
  return rawgGet<RawgGame>(`/games/${rawgId}`, new URLSearchParams({ key }));
}

export function releaseYear(released?: string | null): number | null {
  if (!released) return null;
  const y = parseInt(released.split("-")[0] ?? "", 10);
  return isNaN(y) ? null : y;
}
