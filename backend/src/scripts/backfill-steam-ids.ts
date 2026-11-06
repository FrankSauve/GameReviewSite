/**
 * One-time fill of `Game.steamAppId` for games added before Steam was a source.
 * Dry-run unless --write is passed. Reads RAWG, so it only works while RAWG is up.
 *
 * Lives under src/ so `tsc` emits it to dist/scripts/ and the runtime image
 * can run it; the container has no npm and no tsx.
 *
 * Usage: npm run backfill:steam-ids -- [--write] [--delay=<ms>]
 *        node dist/scripts/backfill-steam-ids.js [--write] [--delay=<ms>]
 */
import "dotenv/config";
import { rawgSteamAppId } from "../lib/gameSources/rawg.js";
import { prisma } from "../lib/prisma.js";

const DEFAULT_DELAY_MS = 1_000;
const MAX_FAILURES_IN_A_ROW = 3;

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

async function main() {
  const { write, delayMs } = parseArgs(process.argv.slice(2));
  const games = await prisma.game.findMany({
    where: { rawgId: { not: null }, steamAppId: null },
    select: { id: true, title: true, rawgId: true },
    orderBy: { title: "asc" },
  });
  console.log(`${games.length} games have no Steam id.`);

  const held = new Map(
    (
      await prisma.game.findMany({
        where: { steamAppId: { not: null } },
        select: { steamAppId: true, title: true },
      })
    ).map((game) => [game.steamAppId, game.title]),
  );

  let found = 0;
  let notOnSteam = 0;
  let failures = 0;
  const failed: string[] = [];
  const conflicts: string[] = [];
  const pause = () => new Promise((resolve) => setTimeout(resolve, delayMs));

  for (const game of games) {
    if (!game.rawgId) continue;
    let appId: string | null;
    try {
      appId = await rawgSteamAppId(game.rawgId);
      failures = 0;
    } catch (err) {
      failed.push(`${game.title}: ${String(err)}`);
      failures += 1;
      if (failures < MAX_FAILURES_IN_A_ROW) {
        await pause();
        continue;
      }
      console.log(
        "RAWG keeps failing, so stopping. Re-run this when it is up.",
      );
      break;
    }

    if (!appId) notOnSteam += 1;
    else if (held.has(appId))
      conflicts.push(`${game.title}: ${appId} is ${held.get(appId)}`);
    else {
      found += 1;
      held.set(appId, game.title);
      console.log(`${game.title}: ${appId}`);
      if (write)
        await prisma.game.update({
          where: { id: game.id },
          data: { steamAppId: appId },
        });
    }
    await pause();
  }

  console.log(
    `${write ? "Wrote" : "Would write"} ${found}; ${notOnSteam} not on Steam.`,
  );
  for (const conflict of conflicts) console.log(`Already held: ${conflict}`);
  for (const failure of failed) console.log(`Failed: ${failure}`);
}

await main();
await prisma.$disconnect();
