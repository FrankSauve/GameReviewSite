const RAWG_BASE = "https://api.rawg.io/api";

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

export async function searchRawg(query: string): Promise<RawgGame[]> {
  const key = getApiKey();
  // query is encoded via URLSearchParams — never interpolated raw into the URL
  const params = new URLSearchParams({
    key,
    search: query,
    page_size: "12",
    ordering: "-relevance",
  });
  const res = await fetch(`${RAWG_BASE}/games?${params.toString()}`);
  if (!res.ok) throw new Error(`RAWG API returned ${res.status}`);
  const data = (await res.json()) as { results?: RawgGame[] };
  return data.results ?? [];
}

export async function getRawgGame(rawgId: number): Promise<RawgGame> {
  const key = getApiKey();
  const params = new URLSearchParams({ key });
  const res = await fetch(`${RAWG_BASE}/games/${rawgId}?${params.toString()}`);
  if (!res.ok) throw new Error(`RAWG API returned ${res.status}`);
  return (await res.json()) as RawgGame;
}

export function releaseYear(released?: string | null): number | null {
  if (!released) return null;
  const y = parseInt(released.split("-")[0] ?? "", 10);
  return isNaN(y) ? null : y;
}
