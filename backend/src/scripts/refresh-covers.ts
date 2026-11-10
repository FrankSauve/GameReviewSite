/**
 * One-time move of covers off RAWG's image host, to Steam's or TheGamesDB's.
 * Prints a plan and writes nothing unless --write is passed. A game whose
 * source offers no cover keeps the one it has.
 *
 * Usage: node dist/scripts/refresh-covers.js [--write] [--delay=<ms>]
 */
import "dotenv/config";
import { coverSource, needsNewCover } from "../lib/coverRefresh.js";
import { steamSource } from "../lib/gameSources/steam.js";
import { tgdbSource } from "../lib/gameSources/tgdb.js";
import { prisma } from "../lib/prisma.js";

/** Steam's appdetails starts refusing at around 200 calls in five minutes. */
const DEFAULT_DELAY_MS = 2_000;
const FAILURE_PAUSE_MS = 30_000;
const MAX_FAILURES_IN_A_ROW = 3;

const SOURCES = { STEAM: steamSource, TGDB: tgdbSource };

function parseArgs(argv: string[]) {
  let write = false;
  let delayMs = DEFAULT_DELAY_MS;
  for (const arg of argv) {
    const delay = /^--delay=(\d+)$/.exec(arg);
    if (arg === "--write") write = true;
    else if (delay) delayMs = parseInt(delay[1] ?? "", 10);
    else
      throw new Error(
        `Unknown argument ${arg}. Usage: [--write] [--delay=<ms>]`,
      );
  }
  return { write, delayMs };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { write, delayMs } = parseArgs(process.argv.slice(2));
  const games = (
    await prisma.game.findMany({
      select: {
        id: true,
        title: true,
        coverUrl: true,
        steamAppId: true,
        tgdbId: true,
      },
      orderBy: { title: "asc" },
    })
  ).filter((game) => needsNewCover(game.coverUrl));
  console.log(`${games.length} games need a new cover.\n`);

  const replaced: string[] = [];
  const noSource: string[] = [];
  const noCover: string[] = [];
  const failed: string[] = [];
  let failures = 0;

  try {
    for (const game of games) {
      const plan = coverSource(game);
      if (!plan) {
        noSource.push(game.title);
        continue;
      }
      const label = `${game.title}  <-  ${plan.source} ${plan.externalId}`;
      let coverUrl;
      try {
        coverUrl = (await SOURCES[plan.source].detail(plan.externalId))
          ?.coverUrl;
        failures = 0;
      } catch {
        failed.push(label);
        failures += 1;
        if (failures >= MAX_FAILURES_IN_A_ROW) {
          console.log(
            `${plan.source} keeps failing, so stopping. Re-run to resume.`,
          );
          break;
        }
        await sleep(FAILURE_PAUSE_MS);
        continue;
      }

      if (!coverUrl) noCover.push(label);
      else {
        if (write)
          await prisma.game.update({
            where: { id: game.id },
            data: { coverUrl },
          });
        replaced.push(`${label}\n    ${coverUrl}`);
      }
      await sleep(delayMs);
    }
  } finally {
    const section = (heading: string, lines: string[]) => {
      console.log(`\n${heading} (${lines.length})`);
      for (const line of lines) console.log(`  ${line}`);
    };
    section(write ? "Replaced" : "Would replace", replaced);
    section("Source has no cover: kept", noCover);
    section("No Steam or TheGamesDB id: kept", noSource);
    section("Failed", failed);
  }
}

await main().finally(() => prisma.$disconnect());
