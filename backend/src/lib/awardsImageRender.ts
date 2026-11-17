import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import satori from "satori";
import { renderAsync } from "@resvg/resvg-js";

import {
  IMAGE_SIZES,
  awardsImageTree,
  type AwardsImageData,
  type ImageKind,
} from "./awardsImage.js";
import type { ImagePalette } from "./awardsImagePalettes.js";
import { coverUrl } from "./gameSources/fields.js";
import { COVER_DOMAIN } from "./gameSources/steam.js";
import { COVER_HOSTS as TGDB_HOSTS } from "./gameSources/tgdb.js";

/** Bump when the layout changes, so a cached image or ETag is not reused. */
const LAYOUT_VERSION = 1;

const COVER_TIMEOUT_MS = 5_000;
const COVER_MAX_BYTES = 2 * 1024 * 1024;

/** Satori reads static TTF/OTF/WOFF only; the site's own fonts are variable WOFF2. */
const FONT_WEIGHTS = [500, 600, 700, 800, 900] as const;
/**
 * Satori falls back only across differently named fonts, so each subset past
 * latin gets a name of its own, or a title outside latin draws as nothing.
 */
const FONT_SUBSETS = [
  "latin",
  "latin-ext",
  "cyrillic",
  "cyrillic-ext",
  "greek",
  "greek-ext",
  "vietnamese",
] as const;
let fonts: Parameters<typeof satori>[1]["fonts"] | undefined;
function loadFonts() {
  if (fonts) return fonts;
  const require = createRequire(import.meta.url);
  const dir = join(
    dirname(require.resolve("@fontsource/inter-tight/package.json")),
    "files",
  );
  fonts = FONT_SUBSETS.flatMap((subset) =>
    FONT_WEIGHTS.map((weight) => ({
      name: subset === "latin" ? "Inter Tight" : `Inter Tight ${subset}`,
      weight,
      style: "normal" as const,
      data: readFileSync(
        join(dir, `inter-tight-${subset}-${weight}-normal.woff`),
      ),
    })),
  );
  return fonts;
}

export type AwardsImageSource = Omit<
  AwardsImageData,
  "ranking" | "categories"
> & {
  ranking: { rank: number; game: { title: string; coverUrl: string | null } }[];
  categories: {
    name: string;
    game: { title: string; coverUrl: string | null };
  }[];
};

/**
 * The ETag, and the `v` an `og:image` URL carries so a chat client refetches.
 * The palette's colours, not its key: a recoloured palette is a new image.
 */
export function awardsImageVersion(
  source: AwardsImageSource,
  palette: ImagePalette,
): string {
  return createHash("sha256")
    .update(JSON.stringify([LAYOUT_VERSION, palette, source]))
    .digest("base64url")
    .slice(0, 16);
}

export interface InlinedCover {
  /** A data URI, or null for the placeholder. */
  cover: string | null;
  /** The CDN was unreachable or failing, so the next attempt may succeed. */
  transient: boolean;
}

/**
 * The host is checked again here, not trusted from the row: this is the server
 * making the request.
 */
export async function inlineCover(
  url: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<InlinedCover> {
  const placeholder = (transient: boolean) => ({ cover: null, transient });
  const allowed = coverUrl(url, [COVER_DOMAIN, ...TGDB_HOSTS]);
  if (!allowed) return placeholder(false);
  try {
    const res = await fetchImpl(allowed, {
      redirect: "error",
      signal: AbortSignal.timeout(COVER_TIMEOUT_MS),
    });
    if (!res.ok) return placeholder(res.status >= 500 || res.status === 429);
    const type = res.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return placeholder(false);
    if (Number(res.headers.get("content-length")) > COVER_MAX_BYTES)
      return placeholder(false);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > COVER_MAX_BYTES) return placeholder(false);
    return {
      cover: `data:${type};base64,${body.toString("base64")}`,
      transient: false,
    };
  } catch {
    return placeholder(true);
  }
}

/** `complete` is false when a cover could not be fetched but may yet be. */
async function withCovers(
  source: AwardsImageSource,
  fetchImpl: typeof fetch,
): Promise<{ data: AwardsImageData; complete: boolean }> {
  const urls = new Set(
    [...source.ranking, ...source.categories].map((e) => e.game.coverUrl),
  );
  const covers = new Map(
    await Promise.all(
      [...urls].map(
        async (url) => [url, await inlineCover(url, fetchImpl)] as const,
      ),
    ),
  );
  const game = (g: { title: string; coverUrl: string | null }) => ({
    title: g.title,
    cover: covers.get(g.coverUrl)?.cover ?? null,
  });
  return {
    data: {
      ...source,
      ranking: source.ranking.map((r) => ({
        rank: r.rank,
        game: game(r.game),
      })),
      categories: source.categories.map((c) => ({
        name: c.name,
        game: game(c.game),
      })),
    },
    complete: ![...covers.values()].some((c) => c.transient),
  };
}

export interface RenderedAwardsImage {
  png: Buffer;
  /** False when drawn with a placeholder for a cover that may yet load. */
  complete: boolean;
}

/** Rendered images by version and kind. */
const CACHE_MAX = 24;
const cache = new Map<string, Promise<RenderedAwardsImage>>();

export function renderAwardsImage(
  kind: ImageKind,
  source: AwardsImageSource,
  palette: ImagePalette,
  version: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RenderedAwardsImage> {
  const key = `${version}:${kind}`;
  const hit = cache.get(key);
  if (hit) {
    // Re-inserted, so eviction drops the least recently used.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const rendering = (async () => {
    const { data, complete } = await withCovers(source, fetchImpl);
    const { width, height } = IMAGE_SIZES[kind];
    const svg = await satori(awardsImageTree(kind, data, palette), {
      width,
      height,
      fonts: loadFonts(),
    });
    // Off the event loop: a portrait takes long enough to stall other requests.
    const image = await renderAsync(svg, {
      fitTo: { mode: "width", value: width },
    });
    return { png: image.asPng(), complete };
  })();
  // Neither a failure nor a placeholder is kept, or one outage would stick until
  // eviction. Only this entry: a newer render may already hold the key.
  const drop = () => {
    if (cache.get(key) === rendering) cache.delete(key);
  };
  rendering.then(({ complete }) => {
    if (!complete) drop();
  }, drop);

  cache.set(key, rendering);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return rendering;
}
