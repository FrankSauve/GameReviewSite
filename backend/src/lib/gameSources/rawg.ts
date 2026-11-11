import { coverUrl, gameFields, yearOf } from "./fields.js";
import { getJson, requireList, sourceUnavailable } from "./http.js";
import type { GameFields, GameSource } from "./types.js";

const RAWG_BASE = "https://api.rawg.io/api";
export const COVER_HOSTS = ["media.rawg.io"];

interface RawgGame {
  id: number;
  name: string;
  released?: string | null;
  background_image?: string | null;
  genres?: { name: string }[];
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

export function gameFieldsFromRawg(detail: RawgGame): GameFields | null {
  return gameFields({
    title: detail.name,
    coverUrl: coverUrl(detail.background_image, COVER_HOSTS),
    genres: (detail.genres ?? []).map(({ name }) => name),
    releaseYear: yearOf(detail.released),
    description: detail.description_raw ?? null,
  });
}

export const rawgSource: GameSource = {
  id: "RAWG",

  async search(query) {
    // query is encoded via URLSearchParams — never interpolated raw into the URL
    const params = new URLSearchParams({
      key: getApiKey(),
      search: query,
      page_size: "12",
      ordering: "-relevance",
    });
    const data = await getJson<{ results?: RawgGame[] }>(
      "RAWG",
      `${RAWG_BASE}/games?${params.toString()}`,
    );
    return requireList("RAWG", data?.results).map((game) => ({
      externalId: String(game.id),
      title: game.name,
      coverUrl: coverUrl(game.background_image, COVER_HOSTS),
      releaseYear: yearOf(game.released),
      genres: (game.genres ?? []).map((genre) => genre.name),
      metacritic: game.metacritic ?? null,
    }));
  },

  async detail(externalId) {
    const params = new URLSearchParams({ key: getApiKey() });
    const id = parseInt(externalId, 10);
    const game = await getJson<RawgGame>(
      "RAWG",
      `${RAWG_BASE}/games/${id}?${params.toString()}`,
    );
    if (game && typeof game.name !== "string")
      throw sourceUnavailable("RAWG", "answered without a game");
    return game && gameFieldsFromRawg(game);
  },
};
