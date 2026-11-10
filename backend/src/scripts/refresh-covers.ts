/**
 * One-time move of covers off RAWG's image host, to Steam's or TheGamesDB's.
 * Prints a plan and writes nothing unless --write is passed. A game whose
 * source offers no cover keeps the one it has.
 *
 * Usage: node dist/scripts/refresh-covers.js [--write] [--delay=<ms>]
 */
import "dotenv/config";
import {
  coverSource,
  failureReason,
  needsNewCover,
} from "../lib/coverRefresh.js";
import { gameDetail } from "../lib/gameSources/index.js";
import { tgdbSource } from "../lib/gameSources/tgdb.js";
import type { GameSourceId } from "../lib/gameSources/types.js";
import { prisma } from "../lib/prisma.js";

/** Steam's appdetails refuses past about 200 calls in five minutes; 2s stays under. */
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
  const skipped: string[] = [];
  const failures = new Map<GameSourceId, number>();
  const notBefore = new Map<GameSourceId, number>();
  const stopped = new Set<GameSourceId>();

  try {
    for (const game of games) {
      const plan = coverSource(game);
      if (!plan) {
        noSource.push(game.title);
        continue;
      }
      const label = `${game.title}  <-  ${plan.source} ${plan.externalId}`;
      // enabled() is off without a key, or once the allowance nears the reserve.
      if (
        stopped.has(plan.source) ||
        (plan.source === "TGDB" && tgdbSource.enabled?.() === false)
      ) {
        skipped.push(label);
        continue;
      }

      await sleep(Math.max(0, (notBefore.get(plan.source) ?? 0) - Date.now()));
      let fields: Awaited<ReturnType<typeof gameDetail>>;
      try {
        fields = await gameDetail(plan.source, plan.externalId);
        failures.set(plan.source, 0);
        if (plan.source === "STEAM")
          notBefore.set("STEAM", Date.now() + delayMs);
      } catch (err) {
        failed.push(`${label}: ${failureReason(err)}`);
        const streak = (failures.get(plan.source) ?? 0) + 1;
        failures.set(plan.source, streak);
        if (streak >= MAX_FAILURES_IN_A_ROW) stopped.add(plan.source);
        notBefore.set(plan.source, Date.now() + FAILURE_PAUSE_MS);
        continue;
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
    section(
      "Source returned nothing for that id (mistyped, delisted, or not a game): kept",
      notFound,
    );
    section("No Steam or TheGamesDB id: kept", noSource);
    section("Deleted during the run", gone);
    section("Failed", failed);
    section(
      "Not asked: source stopped, unset or near its allowance; re-run later",
      skipped,
    );
    for (const source of stopped)
      console.log(
        `\n${source} failed ${MAX_FAILURES_IN_A_ROW} times in a row, so its remaining games were skipped.`,
      );
    if (failed.length > 0 || skipped.length > 0) process.exitCode = 1;
  }
}

await main().finally(() => prisma.$disconnect());
