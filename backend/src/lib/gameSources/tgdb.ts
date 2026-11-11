import { titleKey } from "../gameMatch.js";
import { coverUrl, gameFields, yearOf } from "./fields.js";
import { getJson, requireList, sourceUnavailable } from "./http.js";
import type { GameFields, GameHit, GameSource } from "./types.js";

const TGDB_BASE = "https://api.thegamesdb.net";
export const COVER_HOSTS = ["cdn.thegamesdb.net"];
const MAX_RESULTS = 12;
/** Left for picking a game, so search going quiet does not strand a reader. */
const ALLOWANCE_RESERVE = 50;

/** TheGamesDB's genre ids, in RAWG's spelling so the library's filter stays one list. */
const GENRES: Record<number, string> = {
  1: "Action",
  2: "Adventure",
  3: "Simulation",
  4: "RPG",
  5: "Puzzle",
  6: "Strategy",
  7: "Racing",
  8: "Shooter",
  9: "Simulation",
  10: "Fighting",
  11: "Sports",
  12: "Sandbox",
  13: "Simulation",
  14: "Massively Multiplayer",
  15: "Platformer",
  16: "Stealth",
  17: "Music",
  18: "Horror",
  19: "Simulation",
  20: "Board Games",
  21: "Educational",
  22: "Family",
  23: "Party",
  25: "Quiz",
};

/** Unofficial, GBA/PSP Video and Demo: ROM hacks and the like, not games to review. */
const NOT_GAMES = new Set([28, 29, 30]);

interface TgdbGame {
  id: number;
  game_title: string;
  release_date?: string | null;
  overview?: string | null;
  genres?: number[] | null;
}

interface Boxart {
  base_url?: { large?: string; thumb?: string };
  data?: Record<string, { side?: string; filename: string }[]>;
}

interface Allowance {
  remaining_monthly_allowance?: number;
  extra_allowance?: number | null;
  allowance_refresh_timer?: number | null;
}

interface Answer extends Allowance {
  data?: { games?: TgdbGame[] };
  include?: { boxart?: Boxart };
}

interface ImagesAnswer extends Allowance {
  data?: {
    base_url?: { large?: string };
    images?: Record<string, { id: number; type: string; filename: string }[]>;
  };
}

let lowUntil = 0;

function apiKey(): string {
  const key = process.env["TGDB_API_KEY"];
  // A saved link reaches detail even when `enabled` keeps search away.
  if (!key) throw sourceUnavailable("TheGamesDB", "TGDB_API_KEY is not set");
  return key;
}

const GAME_PARAMS = { fields: "genres,overview", include: "boxart" };

async function get<T extends Allowance>(
  path: string,
  params: Record<string, string>,
) {
  const query = new URLSearchParams({ apikey: apiKey(), ...params });
  const answer = await getJson<T>(
    "TheGamesDB",
    `${TGDB_BASE}${path}?${query.toString()}`,
  );
  const remaining = answer?.remaining_monthly_allowance;
  const extra = answer?.extra_allowance ?? 0;
  if (remaining !== undefined && remaining + extra < ALLOWANCE_RESERVE)
    lowUntil = Date.now() + (answer?.allowance_refresh_timer ?? 3600) * 1000;
  return answer;
}

/** A release date of 1970 is an unset field, not a game from then. */
function releaseYear(game: TgdbGame): number | null {
  const year = yearOf(game.release_date);
  return year === 1970 ? null : year;
}

/** "[Special Edition]" and the like are retail variants of one game. */
const baseTitle = (title: string) =>
  title.replace(/\s*\[[^\]]*\]\s*$/, "").trim();

function cover(game: TgdbGame, box: Boxart | undefined, base?: string) {
  const front = box?.data?.[game.id]?.find((art) => art.side === "front");
  return front ? coverUrl(`${base}${front.filename}`, COVER_HOSTS) : null;
}

const genresOf = (game: TgdbGame) =>
  (game.genres ?? []).flatMap((id) => GENRES[id] ?? []);

/** Lowest id wins a tie. It can still change, which is why a hit lists the others. */
function richer(box: Boxart | undefined) {
  const score = (game: TgdbGame) =>
    (box?.data?.[game.id]?.some((art) => art.side === "front") ? 2 : 0) +
    (game.overview ? 1 : 0);
  return (a: TgdbGame, b: TgdbGame) => score(b) - score(a) || a.id - b.id;
}

/**
 * One game arrives once per platform, region and retail edition. Within this
 * source, the same title and year is taken to be one game.
 */
function grouped(answer: Answer | null): GameHit[] {
  const box = answer?.include?.boxart;
  const groups = new Map<string, TgdbGame[]>();
  for (const game of requireList("TheGamesDB", answer?.data?.games)) {
    if (game.genres?.some((id) => NOT_GAMES.has(id))) continue;
    if (!baseTitle(game.game_title)) continue;
    const key = `${titleKey(baseTitle(game.game_title))}|${releaseYear(game)}`;
    groups.set(key, [...(groups.get(key) ?? []), game]);
  }
  return [...groups.values()].slice(0, MAX_RESULTS).flatMap((rows) => {
    const [game, ...others] = [...rows].sort(richer(box));
    if (!game) return [];
    return {
      externalId: String(game.id),
      otherIds: others.map(({ id }) => String(id)),
      title: baseTitle(game.game_title),
      coverUrl: cover(game, box, box?.base_url?.thumb),
      releaseYear: releaseYear(game),
      genres: genresOf(game),
      metacritic: null,
    };
  });
}

/** TheGamesDB answers for up to this many games in one call. */
export const ART_BATCH = 20;

/** The first fan art uploaded for each game: wide, 16:9, and free of logos. */
export async function tgdbFanart(ids: string[]): Promise<Map<string, string>> {
  const answer = await get<ImagesAnswer>("/v1/Games/Images", {
    games_id: ids.join(","),
    "filter[type]": "fanart",
  });
  const base = answer?.data?.base_url?.large;
  const fanart = new Map<string, string>();
  for (const [id, images] of Object.entries(answer?.data?.images ?? {})) {
    const first = images
      .filter((image) => image.type === "fanart")
      .sort((a, b) => a.id - b.id)[0];
    const url = first && coverUrl(`${base}${first.filename}`, COVER_HOSTS);
    if (url) fanart.set(id, url);
  }
  return fanart;
}

function fieldsOf(answer: Answer | null): GameFields | null {
  const game = requireList("TheGamesDB", answer?.data?.games)[0];
  if (!game) return null;
  const box = answer?.include?.boxart;
  const boxart = cover(game, box, box?.base_url?.large);
  return gameFields({
    title: baseTitle(game.game_title),
    coverUrl: boxart,
    posterUrl: boxart,
    bannerUrl: null,
    genres: genresOf(game),
    releaseYear: releaseYear(game),
    description: game.overview ?? null,
  });
}

export const tgdbSource: GameSource = {
  id: "TGDB",

  enabled: () => !!process.env["TGDB_API_KEY"] && Date.now() >= lowUntil,

  search: async (query) =>
    grouped(
      await get<Answer>("/v1.1/Games/ByGameName", {
        ...GAME_PARAMS,
        name: query,
      }),
    ),

  async detail(externalId) {
    const fields = fieldsOf(
      await get<Answer>("/v1/Games/ByGameID", {
        ...GAME_PARAMS,
        id: externalId,
      }),
    );
    if (!fields) return null;
    // Art is a nicety: a game is still added without it.
    const bannerUrl = await tgdbFanart([externalId]).then(
      (found) => found.get(externalId) ?? null,
      () => null,
    );
    return { ...fields, bannerUrl };
  },
};
