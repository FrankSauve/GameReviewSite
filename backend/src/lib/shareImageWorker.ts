import { parentPort } from "node:worker_threads";

import type { ImageKind, ImageNode } from "./shareImage.js";
import { drawImage } from "./shareImageDraw.js";

export interface DrawRequest {
  id: number;
  kind: ImageKind;
  tree: ImageNode;
}

export type DrawResponse =
  { id: number; png: Uint8Array } | { id: number; error: string };

let queue: Promise<void> = Promise.resolve();

/** One draw at a time, in arrival order: the queue is the concurrency limit. */
parentPort?.on("message", (request: DrawRequest) => {
  queue = queue.then(() => draw(request));
});

async function draw(request: DrawRequest): Promise<void> {
  const port = parentPort;
  if (!port) return;
  try {
    const png = await drawImage(request.kind, request.tree);
    const done: DrawResponse = { id: request.id, png };
    port.postMessage(done, [png.buffer]);
  } catch (err: unknown) {
    const failed: DrawResponse = {
      id: request.id,
      error: err instanceof Error ? err.message : String(err),
    };
    port.postMessage(failed);
  }
}
