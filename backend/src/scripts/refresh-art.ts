/**
 * Fills each game's poster and banner art from the source its cover came from,
 * for games added before art was stored or during an outage. Prints a plan and
 * writes nothing unless --write is passed.
 *
 * Usage: node dist/scripts/refresh-art.js [--write]
 */
import "dotenv/config";
import { setTimeout as sleep } from "node:timers/promises";
import {
  coverSource,
  failureReason,
  needsNewCover,
} from "../lib/coverRefresh.js";
import {
  ART_BATCH as STEAM_BATCH,
  steamArt,
} from "../lib/gameSources/steam.js";
import { coverUrl } from "../lib/gameSources/fields.js";
import {
  ART_BATCH as TGDB_BATCH,
  COVER_HOSTS as TGDB_HOSTS,
  tgdbFanart,
} from "../lib/gameSources/tgdb.js";
import type { GameArt } from "../lib/gameSources/types.js";
import { prisma } from "../lib/prisma.js";

const PAUSE_MS = 1_000;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/** Each batch's answer by id, or the reason the whole batch failed. */
async function inBatches<T>(
  ids: string[],
  size: number,
  ask: (batch: string[]) => Promise<Map<string, T>>,
): Promise<{ found: Map<string, T>; failed: Map<string, string> }> {
  const found = new Map<string, T>();
  const failed = new Map<string, string>();
  for (const [i, batch] of chunks(ids, size).entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    try {
      for (const [id, value] of await ask(batch)) found.set(id, value);
    } catch (err) {
      for (const id of batch) failed.set(id, failureReason(err));
    }
  }
  return { found, failed };
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.find((arg) => arg !== "--write");
  if (unknown) throw new Error(`Unknown argument ${unknown}. Usage: [--write]`);
  const write = args.includes("--write");

  const games = await prisma.game.findMany({
    select: {
      id: true,
      title: true,
      coverUrl: true,
      steamAppId: true,
      tgdbId: true,
      posterUrl: true,
      bannerUrl: true,
    },
    orderBy: { title: "asc" },
  });
  const planned = games.map((game) => ({
    game,
    plan: coverSource(game),
    // Art from one source beside a cover from another; refresh-covers moves it first.
    elsewhere: !!game.coverUrl && needsNewCover(game),
  }));
  const idsFrom = (source: "STEAM" | "TGDB") =>
    planned.flatMap(({ plan, elsewhere }) =>
      plan?.source === source && !elsewhere ? [plan.externalId] : [],
    );

  const steam = await inBatches(idsFrom("STEAM"), STEAM_BATCH, steamArt);
  const tgdbIds = idsFrom("TGDB");
  const tgdb = process.env["TGDB_API_KEY"]
    ? await inBatches(tgdbIds, TGDB_BATCH, tgdbFanart)
    : {
        found: new Map<string, string>(),
        failed: new Map(tgdbIds.map((id) => [id, "TGDB_API_KEY is not set"])),
      };

  const changed: string[] = [];
  const unanswered: string[] = [];
  const gone: string[] = [];
  const noPoster: string[] = [];
  const noBanner: string[] = [];
  const noSource: string[] = [];
  const coverElsewhere: string[] = [];
  const failed: string[] = [];
  let unchanged = 0;

  for (const { game, plan, elsewhere } of planned) {
    if (!plan) {
      noSource.push(game.title);
      continue;
    }
    const label = `${game.title}  <-  ${plan.source} ${plan.externalId}`;
    if (elsewhere) {
      coverElsewhere.push(label);
      continue;
    }
    const failure = (plan.source === "STEAM" ? steam : tgdb).failed.get(
      plan.externalId,
    );
    if (failure) {
      failed.push(`${label}: ${failure}`);
      continue;
    }
    let art: GameArt;
    if (plan.source === "STEAM") {
      const found = steam.found.get(plan.externalId);
      // Left alone, not cleared: a delisted app keeps the art it was added with.
      if (!found) {
        unanswered.push(label);
        continue;
      }
      art = found;
    } else {
      art = {
        // Box art only: a cover from anywhere else is not portrait.
        posterUrl: coverUrl(game.coverUrl, TGDB_HOSTS),
        bannerUrl: tgdb.found.get(plan.externalId) ?? null,
      };
    }
    if (!art.posterUrl) noPoster.push(label);
    if (!art.bannerUrl) noBanner.push(label);
    if (art.posterUrl === game.posterUrl && art.bannerUrl === game.bannerUrl) {
      unchanged++;
      continue;
    }
    // updateMany, so a game deleted mid-run is reported, not thrown.
    const { count } = write
      ? await prisma.game.updateMany({ where: { id: game.id }, data: art })
      : { count: 1 };
    if (count === 0) gone.push(game.title);
    else changed.push(label);
  }

  const section = (heading: string, lines: string[]) => {
    console.log(`\n${heading} (${lines.length})`);
    for (const line of lines) console.log(`  ${line}`);
  };
  console.log(`${games.length} games; ${unchanged} already had this art.`);
  section(write ? "Updated" : "Would update", changed);
  section("No poster: the cover stands in", noPoster);
  section("No banner: the poster sits beside the title", noBanner);
  section("Steam returned nothing for that app: left alone", unanswered);
  section("No Steam or TheGamesDB id: left alone", noSource);
  section(
    "Cover not from that source yet: left alone, run refresh-covers",
    coverElsewhere,
  );
  section("Deleted during the run", gone);
  section("Failed: left alone, re-run later", failed);
  if (failed.length > 0) process.exitCode = 1;
}

await main().finally(() => prisma.$disconnect());
