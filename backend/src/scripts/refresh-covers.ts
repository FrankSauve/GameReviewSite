/**
 * One-time move of covers off RAWG's image host, to Steam's or TheGamesDB's.
 * Prints a plan and writes nothing unless --write is passed. A game whose
 * source offers no cover keeps the one it has.
 *
 * Usage: node dist/scripts/refresh-covers.js [--write] [--delay=<ms>]
 */
import "dotenv/config";
import { coverSource, needsNewCover } from "../lib/coverRefresh.js";
import { gameDetail } from "../lib/gameSources/index.js";
import type { GameSourceId } from "../lib/gameSources/types.js";
import { prisma } from "../lib/prisma.js";

/** Applies to Steam calls only; TheGamesDB is metered by month, not by minute. */
const DEFAULT_STEAM_DELAY_MS = 2_000;
const FAILURE_PAUSE_MS = 30_000;
const MAX_FAILURES_IN_A_ROW = 3;

function parseArgs(argv: string[]) {
  let write = false;
  let delayMs = DEFAULT_STEAM_DELAY_MS;
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
  const noCover: string[] = [];
  const notFound: string[] = [];
  const noSource: string[] = [];
  const gone: string[] = [];
  const failed: string[] = [];
  const failures = new Map<GameSourceId, number>();
  let stopped: GameSourceId | null = null;

  try {
    for (const game of games) {
      const plan = coverSource(game);
      if (!plan) {
        noSource.push(game.title);
        continue;
      }
      const label = `${game.title}  <-  ${plan.source} ${plan.externalId}`;
      let fields: Awaited<ReturnType<typeof gameDetail>>;
      try {
        fields = await gameDetail(plan.source, plan.externalId);
        failures.set(plan.source, 0);
      } catch (err) {
        failed.push(`${label}: ${String(err)}`);
        const streak = (failures.get(plan.source) ?? 0) + 1;
        failures.set(plan.source, streak);
        if (streak >= MAX_FAILURES_IN_A_ROW) {
          stopped = plan.source;
          break;
        }
        await sleep(FAILURE_PAUSE_MS);
        continue;
      } finally {
        if (plan.source === "STEAM") await sleep(delayMs);
      }

      if (!fields) notFound.push(label);
      else if (!fields.coverUrl) noCover.push(label);
      else {
        // updateMany, so a game deleted mid-run is reported, not thrown.
        const { count } = write
          ? await prisma.game.updateMany({
              where: { id: game.id },
              data: { coverUrl: fields.coverUrl },
            })
          : { count: 1 };
        if (count === 0) gone.push(game.title);
        else replaced.push(`${label}\n    ${fields.coverUrl}`);
      }
    }
  } finally {
    const section = (heading: string, lines: string[]) => {
      console.log(`\n${heading} (${lines.length})`);
      for (const line of lines) console.log(`  ${line}`);
    };
    section(write ? "Replaced" : "Would replace", replaced);
    section("Source has the game but no cover: kept", noCover);
    section("Source has no game under that id: kept", notFound);
    section("No Steam or TheGamesDB id: kept", noSource);
    section("Deleted during the run", gone);
    section("Failed", failed);
    if (stopped)
      console.log(
        `\n${stopped} failed ${MAX_FAILURES_IN_A_ROW} times in a row, so stopped. Re-run to resume.`,
      );
  }
}

await main().finally(() => prisma.$disconnect());
