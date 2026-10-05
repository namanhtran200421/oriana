/// <reference lib="webworker" />

import { SurfacePixels, SurfaceRequest, bakeSurface } from './surfaces';

/** Bakes surfaces off the main thread, handing the pixels back without a copy. */
addEventListener('message', ({ data }: MessageEvent<{ id: number; request: SurfaceRequest }>) => {
  const pixels: SurfacePixels = bakeSurface(data.request);
  const buffers = [pixels.colour, pixels.rough, pixels.normal]
    .filter((b): b is Uint8ClampedArray<ArrayBuffer> => !!b)
    .map((b) => b.buffer);
  postMessage({ id: data.id, pixels }, buffers);
});
