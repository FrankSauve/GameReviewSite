/**
 * One-time fill of `Game.steamAppId` from Steam's own search, which needs no RAWG.
 * Prints a plan and writes nothing unless --write is passed.
 *
 * --skip drops app ids a person ruled out; --pick settles a game with several.
 *
 * Usage: node dist/scripts/match-steam-ids.js [--write] [--delay=<ms>]
 *        [--skip=<id,id>] [--pick=<id,id>]
 */
import "dotenv/config";
import { steamSource } from "../lib/gameSources/steam.js";
import { prisma } from "../lib/prisma.js";
import { planSteamId } from "../lib/steamIdMatch.js";
import { violatesUniqueOn } from "../lib/uniqueViolation.js";

/** Steam started answering 429 at one search every 1.5s, sustained. */
const DEFAULT_DELAY_MS = 3_000;
const FAILURE_PAUSE_MS = 30_000;
const MAX_FAILURES_IN_A_ROW = 3;

function parseArgs(argv: string[]) {
  let write = false;
  let delayMs = DEFAULT_DELAY_MS;
  const skips = new Set<string>();
  const picks = new Set<string>();
  for (const arg of argv) {
    const delay = /^--delay=(\d+)$/.exec(arg);
    const list = /^--(skip|pick)=([\d,]+)$/.exec(arg);
    if (arg === "--write") write = true;
    else if (delay) delayMs = parseInt(delay[1] ?? "", 10);
    else if (list)
      for (const id of (list[2] ?? "").split(","))
        (list[1] === "skip" ? skips : picks).add(id);
    else
      throw new Error(
        `Unknown argument ${arg}. Usage: [--write] [--delay=<ms>] [--skip=<ids>] [--pick=<ids>]`,
      );
  }
  return { write, delayMs, skips, picks };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { write, delayMs, skips, picks } = parseArgs(process.argv.slice(2));
  const games = await prisma.game.findMany({
    where: { steamAppId: null },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  const held = new Map(
    (
      await prisma.game.findMany({
        where: { steamAppId: { not: null } },
        select: { steamAppId: true, title: true },
      })
    ).map((game) => [game.steamAppId, game.title]),
  );
  console.log(`${games.length} games have no Steam id.\n`);

  const links: string[] = [];
  const choices: string[] = [];
  const unmatched: string[] = [];
  const conflicts: string[] = [];
  const failed: string[] = [];
  let failures = 0;

  try {
    for (const game of games) {
      let hits;
      try {
        hits = await steamSource.search(game.title);
        failures = 0;
      } catch {
        failed.push(game.title);
        failures += 1;
        if (failures >= MAX_FAILURES_IN_A_ROW) {
          console.log("Steam keeps failing, so stopping. Re-run to resume.");
          break;
        }
        await sleep(FAILURE_PAUSE_MS);
        continue;
      }

      const plan = planSteamId(game.title, hits, { skips, picks });
      if (plan.kind === "none") unmatched.push(game.title);
      else if (plan.kind === "choose")
        choices.push(
          `${game.title}\n${plan.hits.map((hit) => `    ${hit.externalId}  ${hit.title}`).join("\n")}`,
        );
      else if (held.has(plan.hit.externalId))
        conflicts.push(
          `${game.title}: ${plan.hit.externalId} is ${held.get(plan.hit.externalId)}`,
        );
      else {
        const { externalId, title } = plan.hit;
        try {
          if (write)
            await prisma.game.update({
              where: { id: game.id },
              data: { steamAppId: externalId },
            });
          held.set(externalId, game.title);
          links.push(`${externalId}  ${game.title}  ->  ${title}`);
        } catch (err) {
          if (!violatesUniqueOn(err, "steamAppId")) throw err;
          conflicts.push(
            `${game.title}: ${externalId} was taken during this run`,
          );
        }
      }
      await sleep(delayMs);
    }
  } finally {
    const section = (heading: string, lines: string[]) => {
      console.log(`\n${heading} (${lines.length})`);
      for (const line of lines) console.log(`  ${line}`);
    };
    section(write ? "Linked" : "Would link", links);
    section("Several matches: settle with --pick or --skip", choices);
    section("Already held", conflicts);
    section("No match", unmatched);
    section("Failed", failed);
  }
}

await main().finally(() => prisma.$disconnect());
