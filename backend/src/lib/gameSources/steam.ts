import { coverUrl, decodeEntities, gameFields } from "./fields.js";
import { getJson, sourceUnavailable } from "./http.js";
import type { GameHit, GameSource } from "./types.js";

const COVER_HOST = "shared.akamai.steamstatic.com";
const CATEGORY_GAMES = "998";
const CATEGORY_DLC = "21";
const MAX_RESULTS = 12;

/** Steam's own labels, less the ones that are not genres ("Free To Play"). */
const GENRES = new Set([
  "Action",
  "Adventure",
  "Casual",
  "Indie",
  "Massively Multiplayer",
  "RPG",
  "Racing",
  "Simulation",
  "Sports",
  "Strategy",
]);

interface SearchItem {
  name: string;
  logo?: string;
}

interface App {
  type?: string;
  name: string;
  short_description?: string;
  header_image?: string;
  genres?: { description: string }[];
  release_date?: { date?: string };
}

const cleanTitle = (name: string) =>
  decodeEntities(name).replace(/[™®©]/g, "").trim();

/**
 * Steam answers from whichever CDN it likes, request to request, with the same
 * paths on all of them. The CSP names one, so every cover is pinned to it.
 */
const cover = (url?: string) =>
  coverUrl(
    url?.replace(
      /^https:\/\/shared\.[a-z]+\.steamstatic\.com\//,
      `https://${COVER_HOST}/`,
    ),
    [COVER_HOST],
  );

/** A bundle's logo is under /subs/, so it falls out here too. */
const appIdOf = (logo?: string) => logo?.match(/\/steam\/apps\/(\d+)\//)?.[1];

async function search(query: string, category: string): Promise<GameHit[]> {
  const params = new URLSearchParams({
    term: query,
    category1: category,
    json: "1",
    count: String(MAX_RESULTS),
    cc: "US",
    l: "english",
  });
  const data = await getJson<{ items?: SearchItem[] }>(
    "Steam",
    `https://store.steampowered.com/search/results/?${params.toString()}`,
  );
  // Undocumented: anything but a list must fall through, not read as no results.
  if (!Array.isArray(data?.items))
    throw sourceUnavailable("Steam", "search answered without a list");
  const hits: GameHit[] = [];
  for (const item of data.items.slice(0, MAX_RESULTS)) {
    const externalId = appIdOf(item.logo);
    if (!externalId) continue;
    hits.push({
      externalId,
      title: cleanTitle(item.name),
      coverUrl: cover(item.logo),
      releaseYear: null,
      genres: [],
      metacritic: null,
    });
  }
  return hits;
}

/** Search leaves expansions out, and reviewers review those too. */
export const searchSteamDlc = (query: string) => search(query, CATEGORY_DLC);

export const steamSource: GameSource = {
  id: "STEAM",

  search: (query) => search(query, CATEGORY_GAMES),

  async detail(externalId) {
    const params = new URLSearchParams({
      appids: externalId,
      l: "english",
      cc: "US",
    });
    const data = await getJson<
      Record<string, { success: boolean; data?: App }>
    >(
      "Steam",
      `https://store.steampowered.com/api/appdetails?${params.toString()}`,
    );
    const app = data?.[externalId]?.data;
    if (!app || (app.type !== "game" && app.type !== "dlc")) return null;

    const year = app.release_date?.date?.match(/\b(?:19|20)\d{2}\b/)?.[0];
    return gameFields({
      title: cleanTitle(app.name),
      // Taken from the answer: newer apps hash their asset paths, so a URL derived
      // from the app id 404s.
      coverUrl: cover(app.header_image),
      genres: (app.genres ?? [])
        .map(({ description }) => description)
        .filter((name) => GENRES.has(name)),
      releaseYear: year ? parseInt(year, 10) : null,
      description: decodeEntities(app.short_description ?? ""),
    });
  },
};
