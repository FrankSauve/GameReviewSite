import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";

import type { ImageKind, ImageNode } from "./shareImage.js";
import type { ImagePalette } from "./shareImagePalettes.js";
import type { DrawRequest, DrawResponse } from "./shareImageWorker.js";
import { coverUrl } from "./gameSources/fields.js";
import { COVER_DOMAIN } from "./gameSources/steam.js";
import { COVER_HOSTS as TGDB_HOSTS } from "./gameSources/tgdb.js";

const COVER_TIMEOUT_MS = 5_000;
const COVER_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The ETag, and the `v` an `og:image` URL carries so a chat client refetches.
 * The palette's colours, not its key: a recoloured palette is a new image.
 */
export function imageVersion(
  layout: number,
  palette: ImagePalette,
  source: unknown,
): string {
  return createHash("sha256")
    .update(JSON.stringify([layout, palette, source]))
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
    // Manual, so a redirect is a final placeholder rather than a thrown, and
    // so transient, failure that would keep every render of it uncached.
    const res = await fetchImpl(allowed, {
      redirect: "manual",
      signal: AbortSignal.timeout(COVER_TIMEOUT_MS),
    });
    // 403 is how the CDNs rate-limit, as in gameSources/http.ts.
    if (!res.ok)
      return placeholder(
        res.status >= 500 || res.status === 429 || res.status === 403,
      );
    const type = res.headers.get("content-type") ?? "";
    // Only what resvg can decode: a WebP cover would draw as an empty box.
    if (!/^image\/(jpeg|png)$/.test(type)) return placeholder(false);
    if (Number(res.headers.get("content-length")) > COVER_MAX_BYTES)
      return placeholder(false);
    const body = await readCapped(res, COVER_MAX_BYTES);
    if (!body) return placeholder(false);
    return {
      cover: `data:${type};base64,${body.toString("base64")}`,
      transient: false,
    };
  } catch {
    return placeholder(true);
  }
}

/** Null past `max` bytes, stopping there: a missing content-length is no cap. */
async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
}

/** A cover URL to its inlined data URI, or null for the placeholder. */
export type Covers = (url: string | null) => string | null;

/** `complete` is false when a cover could not be fetched but may yet be. */
async function fetchCovers(
  urls: Iterable<string | null>,
  fetchImpl: typeof fetch,
): Promise<{ covers: Covers; complete: boolean }> {
  const inlined = new Map(
    await Promise.all(
      [...new Set(urls)].map(
        async (url) => [url, await inlineCover(url, fetchImpl)] as const,
      ),
    ),
  );
  return {
    covers: (url) => inlined.get(url)?.cover ?? null,
    complete: ![...inlined.values()].some((c) => c.transient),
  };
}

/**
 * Run from source (tests, `npm run dev`), the worker is a .ts file and needs
 * tsx's loader; built, it is plain .js beside this one.
 */
const FROM_SOURCE = import.meta.url.endsWith(".ts");
const WORKER_URL = new URL(
  `./shareImageWorker.${FROM_SOURCE ? "ts" : "js"}`,
  import.meta.url,
);

let worker: Worker | undefined;
let nextId = 0;
const waiting = new Map<
  number,
  { resolve: (png: Buffer) => void; reject: (err: Error) => void }
>();

function failAll(err: Error): void {
  for (const pending of waiting.values()) pending.reject(err);
  waiting.clear();
}

/** One worker, started on first use and again after it dies. */
function drawWorker(): Worker {
  if (worker) return worker;
  const started = new Worker(WORKER_URL, {
    execArgv: FROM_SOURCE ? ["--import", "tsx"] : [],
  });
  started.on("message", (response: DrawResponse) => {
    const pending = waiting.get(response.id);
    if (!pending) return;
    waiting.delete(response.id);
    if ("png" in response) pending.resolve(Buffer.from(response.png));
    else pending.reject(new Error(response.error));
    // Idle, it must not keep the process alive on its own.
    if (waiting.size === 0) started.unref();
  });
  started.on("error", (err) => {
    if (worker === started) worker = undefined;
    failAll(err);
  });
  started.on("exit", (code) => {
    if (worker === started) worker = undefined;
    failAll(new Error(`share image worker exited with code ${code}`));
  });
  worker = started;
  return started;
}

/** Off the main thread: satori's layout would otherwise stall every request. */
function drawInWorker(kind: ImageKind, tree: ImageNode): Promise<Buffer> {
  const target = drawWorker();
  const id = nextId++;
  return new Promise<Buffer>((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    target.ref();
    const request: DrawRequest = { id, kind, tree };
    target.postMessage(request);
  });
}

export interface RenderedImage {
  png: Buffer;
  /** False when drawn with a placeholder for a cover that may yet load. */
  complete: boolean;
}

/** Rendered images of every layout, by the caller's key. */
const CACHE_MAX = 24;
const cache = new Map<string, Promise<RenderedImage>>();

/**
 * `key` names the image and its content: a layout, its version and its kind.
 * Covers are fetched here, on the main thread; only the draw is in the worker.
 */
export function renderImage(
  key: string,
  kind: ImageKind,
  coverUrls: Iterable<string | null>,
  tree: (covers: Covers) => ImageNode,
  fetchImpl: typeof fetch = fetch,
): Promise<RenderedImage> {
  const hit = cache.get(key);
  if (hit) {
    // Re-inserted, so eviction drops the least recently used.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const rendering = (async () => {
    const { covers, complete } = await fetchCovers(coverUrls, fetchImpl);
    return { png: await drawInWorker(kind, tree(covers)), complete };
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
