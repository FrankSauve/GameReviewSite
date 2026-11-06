import { titleKey } from "../gameMatch.js";
import { coverUrl, gameFields, yearOf } from "./fields.js";
import { getJson, sourceUnavailable } from "./http.js";
import type { GameFields, GameHit, GameSource } from "./types.js";

const TGDB_BASE = "https://api.thegamesdb.net";
const COVER_HOSTS = ["cdn.thegamesdb.net"];
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

interface Answer {
  data?: { games?: TgdbGame[] };
  include?: { boxart?: Boxart };
  remaining_monthly_allowance?: number;
  allowance_refresh_timer?: number | null;
}

let lowUntil = 0;

function apiKey(): string {
  const key = process.env["TGDB_API_KEY"];
  // A saved link reaches detail even when `enabled` keeps search away.
  if (!key) throw sourceUnavailable("TheGamesDB", "TGDB_API_KEY is not set");
  return key;
}

async function get(path: string, params: Record<string, string>) {
  const query = new URLSearchParams({
    apikey: apiKey(),
    fields: "genres,overview",
    include: "boxart",
    ...params,
  });
  const answer = await getJson<Answer>(
    "TheGamesDB",
    `${TGDB_BASE}${path}?${query.toString()}`,
  );
  const remaining = answer?.remaining_monthly_allowance;
  if (remaining !== undefined && remaining < ALLOWANCE_RESERVE)
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

/** Lowest id wins a tie, so one game keeps one id from search to search. */
function richer(box: Boxart | undefined) {
  const score = (game: TgdbGame) =>
    (box?.data?.[game.id]?.some((art) => art.side === "front") ? 2 : 0) +
    (game.overview ? 1 : 0);
  return (a: TgdbGame, b: TgdbGame) => score(b) - score(a) || a.id - b.id;
}

/** One game arrives once per platform, region and retail edition. */
function grouped(answer: Answer | null): GameHit[] {
  const box = answer?.include?.boxart;
  const groups = new Map<string, TgdbGame[]>();
  for (const game of answer?.data?.games ?? []) {
    if (game.genres?.some((id) => NOT_GAMES.has(id))) continue;
    const key = `${titleKey(baseTitle(game.game_title))}|${releaseYear(game)}`;
    groups.set(key, [...(groups.get(key) ?? []), game]);
  }
  return [...groups.values()].slice(0, MAX_RESULTS).flatMap((rows) => {
    const game = [...rows].sort(richer(box))[0];
    if (!game) return [];
    return {
      externalId: String(game.id),
      title: baseTitle(game.game_title),
      coverUrl: cover(game, box, box?.base_url?.thumb),
      releaseYear: releaseYear(game),
      genres: genresOf(game),
      metacritic: null,
    };
  });
}

function fieldsOf(answer: Answer | null): GameFields | null {
  const game = answer?.data?.games?.[0];
  if (!game) return null;
  const box = answer?.include?.boxart;
  return gameFields({
    title: baseTitle(game.game_title),
    coverUrl: cover(game, box, box?.base_url?.large),
    genres: genresOf(game),
    releaseYear: releaseYear(game),
    description: game.overview ?? null,
  });
}

export const tgdbSource: GameSource = {
  id: "TGDB",

  enabled: () => !!process.env["TGDB_API_KEY"] && Date.now() >= lowUntil,

  search: async (query) =>
    grouped(await get("/v1.1/Games/ByGameName", { name: query })),

  detail: async (externalId) =>
    fieldsOf(await get("/v1/Games/ByGameID", { id: externalId })),
};
