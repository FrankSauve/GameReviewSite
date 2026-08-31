/**
 * One-time repair for games imported before 20260829041559_multi_platform_genre,
 * when `genre` was a single column: they carry at most one genre. Dry-run unless
 * --write is passed; never run it against production.
 *
 * Lives under src/ so `tsc` emits it to dist/scripts/ and the runtime image
 * can run it; the container has no npm and no tsx.
 *
 * Usage: npm run backfill:genres -- [--write] [--delay=<ms>]
 *        node dist/scripts/backfill-genres.js [--write] [--delay=<ms>]
 */
import { prisma } from "../lib/prisma.js";
import { mergeLabels } from "../lib/labels.js";
import { getRawgGame, RawgHttpError } from "../lib/rawg.js";

const DEFAULT_DELAY_MS = 1_000;
/** RAWG's free tier answers a 429 with no Retry-After, so back off by a fixed step. */
const RATE_LIMIT_BACKOFF_MS = 30_000;
const RATE_LIMIT_RETRIES = 2;

interface Options {
  write: boolean;
  delayMs: number;
}

function parseArgs(argv: string[]): Options {
  let write = false;
  let delayMs = DEFAULT_DELAY_MS;

  for (const arg of argv) {
    if (arg === "--write") {
      write = true;
      continue;
    }
    const delay = /^--delay=(\d+)$/.exec(arg);
    if (delay) {
      delayMs = parseInt(delay[1] ?? "", 10);
      continue;
    }
    throw new Error(`Unknown argument ${arg}. Usage: [--write] [--delay=<ms>]`);
  }

  return { write, delayMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGenres(rawgId: number, delayMs: number): Promise<string[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const detail = await getRawgGame(rawgId);
      return (detail.genres ?? []).map((genre) => genre.name);
    } catch (error) {
      if (
        error instanceof RawgHttpError &&
        error.status === 429 &&
        attempt < RATE_LIMIT_RETRIES
      ) {
        const wait = Math.min(RATE_LIMIT_BACKOFF_MS, delayMs * 30);
        console.log(`  rate limited, waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const { write, delayMs } = parseArgs(process.argv.slice(2));

  // Prisma has no array_length filter; `isEmpty` plus a length check after the
  // fetch is the same set, and these rows number in the hundreds at most.
  const candidates = await prisma.game.findMany({
    where: { rawgId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, rawgId: true, title: true, genres: true },
  });
  const stale = candidates.filter((game) => game.genres.length <= 1);

  console.log(
    `${stale.length} of ${candidates.length} imported games have one genre or none.` +
      (write ? "" : " Dry run — pass --write to apply."),
  );

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const game of stale) {
    const rawgId = parseInt(game.rawgId ?? "", 10);
    if (isNaN(rawgId)) {
      console.log(
        `! ${game.title}: rawgId ${String(game.rawgId)} is not a number`,
      );
      failed++;
      continue;
    }

    let genres: string[];
    try {
      genres = await fetchGenres(rawgId, delayMs);
    } catch (error) {
      console.log(
        `! ${game.title} (rawg ${rawgId}): ${error instanceof Error ? error.message : String(error)}`,
      );
      failed++;
      await sleep(delayMs);
      continue;
    }

    const merged = mergeLabels(game.genres, genres);
    if (!merged) {
      unchanged++;
    } else {
      console.log(
        `${write ? "*" : "-"} ${game.title}: [${game.genres.join(", ")}] -> [${merged.join(", ")}]`,
      );
      if (write)
        await prisma.game.update({
          where: { id: game.id },
          data: { genres: merged },
        });
      updated++;
    }

    await sleep(delayMs);
  }

  console.log(
    `${write ? "updated" : "would update"} ${updated}, left alone ${unchanged}, failed ${failed}`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
