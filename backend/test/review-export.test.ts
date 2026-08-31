import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { prisma } from "../src/lib/prisma.js";
import { slugify } from "../src/lib/slug.js";
import { formatReview, reviewEntryName } from "../src/lib/exportMarkdown.js";
import {
  ALICE,
  BOB,
  resetDatabase,
  sessionFor,
  startApp,
  type Identity,
} from "./helpers.js";

/**
 * The review export: a zip holding one markdown file per review.
 *
 * Two things can go wrong here that nothing else in the suite would catch: the
 * archive could contain somebody else's reviews, and it could be quietly
 * incomplete. Both produce a download that looks perfectly fine.
 */

const EXPORT_PATH = "/export/reviews.zip";

/**
 * The archive's entries, keyed by name.
 *
 * Read with a real zip reader rather than by scanning the bytes: an archive
 * whose central directory disagrees with its local headers still contains every
 * string a substring assertion would look for, and that is the shape of
 * corruption these tests exist to catch.
 */
async function readArchive(body: Buffer): Promise<Map<string, string>> {
  const zip = await new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(body, { lazyEntries: true }, (err, file) =>
      err ? reject(err) : resolve(file!),
    );
  });
  const entries = new Map<string, string>();
  await new Promise<void>((resolve, reject) => {
    zip.on("error", reject);
    zip.on("end", resolve);
    zip.on("entry", (entry: Entry) => {
      zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) return reject(err ?? new Error("no stream"));
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          entries.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
          zip.readEntry();
        });
        stream.on("error", reject);
      });
    });
    zip.readEntry();
  });
  return entries;
}

/** Supertest only buffers text bodies unless told the response is binary. */
function getExport(app: Express, cookie: string) {
  return request(app)
    .get(EXPORT_PATH)
    .set("Cookie", cookie)
    .responseType("arraybuffer");
}

async function bodyOf(pending: ReturnType<typeof getExport>): Promise<Buffer> {
  const res = await pending;
  expect(res.status).toBe(200);
  return res.body as Buffer;
}

interface SeedReview {
  title: string;
  /** Defaults to the title's slug; set it where two titles collide, as the app
   *  itself does when it uniquifies a game slug. */
  gameSlug?: string;
  rating?: number;
  hoursPlayed?: number | null;
  yearPlayed?: number | null;
  content?: string;
  createdAt?: Date;
}

async function seedReview(
  identity: Identity,
  review: SeedReview,
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { username: identity.username },
  });
  const game = await prisma.game.create({
    data: {
      title: review.title,
      slug: review.gameSlug ?? slugify(review.title, "game"),
    },
  });
  await prisma.review.create({
    data: {
      rating: review.rating ?? 8,
      content: review.content ?? "It was good.",
      yearPlayed: review.yearPlayed === undefined ? 2024 : review.yearPlayed,
      hoursPlayed: review.hoursPlayed === undefined ? 12 : review.hoursPlayed,
      slug: `${user.username}/${game.slug}`,
      gameId: game.id,
      userId: user.id,
      ...(review.createdAt ? { createdAt: review.createdAt } : {}),
    },
  });
}

describe("exporting reviews as a zip of markdown files", () => {
  let app: Express;
  let stop: () => Promise<void>;

  beforeAll(async () => {
    // The limiter is constructed with the app and counts every request in this
    // file against one IP; the default ten is below what the file makes.
    process.env["EXPORT_RATE_LIMIT_MAX"] = "1000";
    ({ app, stop } = await startApp());
  });
  afterAll(async () => {
    delete process.env["EXPORT_RATE_LIMIT_MAX"];
    await stop();
  });
  beforeEach(resetDatabase);

  it("refuses an anonymous request", async () => {
    const res = await request(app).get(EXPORT_PATH);
    expect(res.status).toBe(401);
  });

  it("offers the archive as a download named after the account", async () => {
    const cookie = await sessionFor(ALICE);
    const res = await getExport(app, cookie);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="reviews-alice.zip"',
    );
    // A shared cache holding one account's reviews would serve them to another.
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  /**
   * One file per review is the whole point of the archive: a single
   * concatenated file had to be re-split by hand before any one review could be
   * filed or edited somewhere else.
   */
  it("gives each review its own file under a folder named for the account", async () => {
    const cookie = await sessionFor(ALICE);
    await seedReview(ALICE, { title: "Elden Ring" });
    await seedReview(ALICE, { title: "Hollow Knight" });

    const entries = await readArchive(await bodyOf(getExport(app, cookie)));
    expect([...entries.keys()].sort()).toEqual([
      "reviews-alice/elden-ring.md",
      "reviews-alice/hollow-knight.md",
    ]);
  });

  it("writes a review in the format the issue specifies", async () => {
    const cookie = await sessionFor(ALICE);
    await seedReview(ALICE, {
      title: "Elden Ring",
      rating: 9.5,
      hoursPlayed: 120,
      content: "Best of its kind.",
    });

    const entries = await readArchive(await bodyOf(getExport(app, cookie)));
    expect(entries.get("reviews-alice/elden-ring.md")).toBe(
      "# Elden Ring\n**Score:** 9.5\n**Playtime:** 120 hrs\n" +
        "**Year played:** 2024\n\nBest of its kind.\n",
    );
  });

  /**
   * Two games can reduce to the same slug. Two entries of one name is an
   * archive that unpacks to a single file, so one review vanishes on extraction
   * while the download itself looks complete.
   */
  it("keeps both reviews when two titles reduce to the same slug", async () => {
    const cookie = await sessionFor(ALICE);
    await seedReview(ALICE, { title: "Portal 2", content: "One." });
    await seedReview(ALICE, {
      title: "Portal: 2",
      gameSlug: "portal-2-2",
      content: "Two.",
    });

    const entries = await readArchive(await bodyOf(getExport(app, cookie)));
    expect([...entries.keys()].sort()).toEqual([
      "reviews-alice/portal-2-2.md",
      "reviews-alice/portal-2.md",
    ]);
  });

  /** A title in a script the slug cannot carry still needs a filename. */
  it("falls back to a usable name for a title that does not slugify", async () => {
    const cookie = await sessionFor(ALICE);
    await seedReview(ALICE, { title: "ドラゴンクエスト" });

    const entries = await readArchive(await bodyOf(getExport(app, cookie)));
    expect([...entries.keys()]).toEqual(["reviews-alice/review.md"]);
  });

  it("leaves the playtime line out when there are no hours recorded", async () => {
    const cookie = await sessionFor(ALICE);
    await seedReview(ALICE, { title: "Old Import", hoursPlayed: null });

    const entries = await readArchive(await bodyOf(getExport(app, cookie)));
    const file = entries.get("reviews-alice/old-import.md")!;
    expect(file).not.toContain("Playtime");
    expect(file).toContain("**Score:**");
  });

  it("leaves the year line out when no year was recorded", async () => {
    const cookie = await sessionFor(ALICE);
    await seedReview(ALICE, { title: "Old Import", yearPlayed: null });

    const entries = await readArchive(await bodyOf(getExport(app, cookie)));
    const file = entries.get("reviews-alice/old-import.md")!;
    expect(file).not.toContain("Year played");
    expect(file).toContain("**Playtime:**");
  });

  it("exports only the signed-in account's own reviews", async () => {
    const cookie = await sessionFor(ALICE);
    await sessionFor(BOB);
    await seedReview(ALICE, { title: "Mine" });
    await seedReview(BOB, { title: "Not Mine" });

    const entries = await readArchive(await bodyOf(getExport(app, cookie)));
    expect([...entries.keys()]).toEqual(["reviews-alice/mine.md"]);
  });

  /**
   * The export reads in batches, so the boundary between them is where a review
   * would go missing or be written twice. A backlog imported in one sitting is
   * also the case where every row shares a `createdAt`, which is what the id
   * tiebreaker in the ordering is for: without it the batches are windows onto
   * two different orderings.
   */
  it("writes every review exactly once across batch boundaries", async () => {
    const cookie = await sessionFor(ALICE);
    const at = new Date("2026-01-01T00:00:00.000Z");
    const titles = Array.from({ length: 120 }, (_, i) => `Game ${i + 1}`);
    for (const title of titles) {
      await seedReview(ALICE, { title, createdAt: at });
    }

    const entries = await readArchive(await bodyOf(getExport(app, cookie)));
    const headings = [...entries.values()].map((file) => file.split("\n")[0]);

    expect(entries.size).toBe(120);
    expect(headings.sort()).toEqual(titles.map((t) => `# ${t}`).sort());
  });

  /**
   * The filename follows the user's slug, not their username. authentik owns
   * the username and renames it; the slug is this app's. Two usernames that
   * reduce to the same slug base would otherwise hand both accounts a file of
   * the same name.
   */
  it("names the file after the account's slug, not its username", async () => {
    const first: Identity = {
      uid: "ak-1",
      username: "Simon.T",
      email: "a@e.com",
    };
    const second: Identity = {
      uid: "ak-2",
      username: "Simon T",
      email: "b@e.com",
    };
    const firstCookie = await sessionFor(first);
    const secondCookie = await sessionFor(second);

    const one = await request(app).get(EXPORT_PATH).set("Cookie", firstCookie);
    const two = await request(app).get(EXPORT_PATH).set("Cookie", secondCookie);

    expect(one.headers["content-disposition"]).toBe(
      'attachment; filename="reviews-simon-t.zip"',
    );
    expect(two.headers["content-disposition"]).not.toBe(
      one.headers["content-disposition"],
    );
  });

  /**
   * A read that fails before anything is written still has a status line to
   * spend. Tearing the connection down instead leaves the browser reporting a
   * network error for what is a server fault.
   */
  it("answers 500 when the export cannot be read at all", async () => {
    const cookie = await sessionFor(ALICE);
    const real = prisma.review.findMany.bind(prisma.review);
    // @ts-expect-error replaced for this test only
    prisma.review.findMany = async () => {
      throw new Error("database is down");
    };
    try {
      const res = await request(app).get(EXPORT_PATH).set("Cookie", cookie);
      expect(res.status).toBe(500);
    } finally {
      prisma.review.findMany = real;
    }
  });

  it("returns an empty archive rather than an error for an account with no reviews", async () => {
    const cookie = await sessionFor(ALICE);
    const res = await getExport(app, cookie);
    expect(res.status).toBe(200);
    expect(await readArchive(await bodyOf(getExport(app, cookie)))).toEqual(
      new Map(),
    );
  });
});

describe("reviewEntryName", () => {
  it("names a review after its game, under the archive's folder", () => {
    expect(reviewEntryName("reviews-alice", "Elden Ring", new Set())).toBe(
      "reviews-alice/elden-ring.md",
    );
  });

  it("suffixes a name already claimed rather than repeating it", () => {
    const taken = new Set<string>();
    expect(reviewEntryName("r", "Portal 2", taken)).toBe("r/portal-2.md");
    expect(reviewEntryName("r", "Portal 2", taken)).toBe("r/portal-2-2.md");
    expect(reviewEntryName("r", "Portal 2", taken)).toBe("r/portal-2-3.md");
  });
});

describe("formatReview", () => {
  const base = {
    gameTitle: "Terraria",
    rating: 8,
    yearPlayed: 2024,
    content: "Dug a hole.",
  };

  it("writes a whole score without a trailing zero", () => {
    expect(formatReview({ ...base, hoursPlayed: 40 })).toContain(
      "**Score:** 8\n",
    );
  });

  it("keeps the half point on a half score", () => {
    expect(formatReview({ ...base, rating: 7.5, hoursPlayed: 40 })).toContain(
      "**Score:** 7.5\n",
    );
  });

  it("does not print 40.0 hours", () => {
    expect(formatReview({ ...base, hoursPlayed: 40 })).toContain(
      "**Playtime:** 40 hrs",
    );
    expect(formatReview({ ...base, hoursPlayed: 40.5 })).toContain(
      "**Playtime:** 40.5 hrs",
    );
  });

  /** Every section ends in exactly one newline, so the separator between two of
   *  them is the same shape no matter how the body was typed. */
  it("normalises the whitespace around the body", () => {
    const section = formatReview({ ...base, content: "\n\nDug a hole.\n\n\n" });
    expect(section.endsWith("Dug a hole.\n")).toBe(true);
  });
});
