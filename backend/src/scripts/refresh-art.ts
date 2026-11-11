/**
 * One-time fill of each game's poster and banner art, from the source its cover
 * came from. Prints a plan and writes nothing unless --write is passed.
 *
 * Usage: node dist/scripts/refresh-art.js [--write]
 */
import "dotenv/config";
import { coverSource, failureReason } from "../lib/coverRefresh.js";
import {
  ART_BATCH as STEAM_BATCH,
  steamArt,
} from "../lib/gameSources/steam.js";
import {
  ART_BATCH as TGDB_BATCH,
  tgdbFanart,
} from "../lib/gameSources/tgdb.js";
import type { GameArt } from "../lib/gameSources/types.js";
import { prisma } from "../lib/prisma.js";

const PAUSE_MS = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const planned = games.map((game) => ({ game, plan: coverSource(game) }));
  const idsFrom = (source: "STEAM" | "TGDB") =>
    planned.flatMap(({ plan }) =>
      plan?.source === source ? [plan.externalId] : [],
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
  const noPoster: string[] = [];
  const noBanner: string[] = [];
  const noSource: string[] = [];
  const failed: string[] = [];
  let unchanged = 0;

  for (const { game, plan } of planned) {
    if (!plan) {
      noSource.push(game.title);
      continue;
    }
    const label = `${game.title}  <-  ${plan.source} ${plan.externalId}`;
    const failure = (plan.source === "STEAM" ? steam : tgdb).failed.get(
      plan.externalId,
    );
    if (failure) {
      failed.push(`${label}: ${failure}`);
      continue;
    }
    const art: GameArt =
      plan.source === "STEAM"
        ? (steam.found.get(plan.externalId) ?? {
            posterUrl: null,
            bannerUrl: null,
          })
        : // The stored cover is TheGamesDB's front box art: already a poster.
          {
            posterUrl: game.coverUrl,
            bannerUrl: tgdb.found.get(plan.externalId) ?? null,
          };
    if (!art.posterUrl) noPoster.push(label);
    if (!art.bannerUrl) noBanner.push(label);
    if (art.posterUrl === game.posterUrl && art.bannerUrl === game.bannerUrl) {
      unchanged++;
      continue;
    }
    if (write)
      await prisma.game.updateMany({ where: { id: game.id }, data: art });
    changed.push(label);
  }

  const section = (heading: string, lines: string[]) => {
    console.log(`\n${heading} (${lines.length})`);
    for (const line of lines) console.log(`  ${line}`);
  };
  console.log(`${games.length} games; ${unchanged} already had this art.`);
  section(write ? "Updated" : "Would update", changed);
  section("No poster: the cover stands in", noPoster);
  section("No banner: the poster sits beside the title", noBanner);
  section("No Steam or TheGamesDB id: left alone", noSource);
  section("Failed: left alone, re-run later", failed);
  if (failed.length > 0) process.exitCode = 1;
}

await main().finally(() => prisma.$disconnect());
