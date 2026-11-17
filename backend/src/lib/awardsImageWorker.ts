import { parentPort } from "node:worker_threads";

import type { AwardsImageData, ImageKind } from "./awardsImage.js";
import type { ImagePalette } from "./awardsImagePalettes.js";
import { drawAwardsImage } from "./awardsImageDraw.js";

export interface DrawRequest {
  id: number;
  kind: ImageKind;
  data: AwardsImageData;
  palette: ImagePalette;
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
    const png = await drawAwardsImage(
      request.kind,
      request.data,
      request.palette,
    );
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
