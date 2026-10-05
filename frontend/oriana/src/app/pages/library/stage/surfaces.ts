import { Noise } from './noise';

/**
 * The pixel work behind the reading room's materials: plain arithmetic over
 * typed arrays, with no DOM, so it can run in a worker (see
 * surfaces.worker.ts) while the page stays responsive.
 */

export type SurfaceKind = 'leather' | 'walnut' | 'edges';

export interface SurfaceRequest {
  kind: SurfaceKind;
  size: number;
  seed?: number;
  light?: number;
}

/** RGBA pixels, `size` × `size`; `rough` and `normal` where the surface has them. */
export interface SurfacePixels {
  size: number;
  colour: Uint8ClampedArray<ArrayBuffer>;
  rough?: Uint8ClampedArray<ArrayBuffer>;
  normal?: Uint8ClampedArray<ArrayBuffer>;
}

export function bakeSurface(request: SurfaceRequest): SurfacePixels {
  switch (request.kind) {
    case 'leather':
      return leather(request.size);
    case 'walnut':
      return walnut(request.size, request.seed ?? 3, request.light ?? 1);
    case 'edges':
      return edges(request.size);
  }
}

/** Grey leather, to be tinted per book: pores, grain, stains. */
function leather(size: number): SurfacePixels {
  // Features are sized in texels of a 512 map, so a smaller map is the same
  // leather at a lower resolution rather than a finer one.
  const k = size / 512;
  const noise = new Noise(7);
  const height = new Float32Array(size * size);
  const colour = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pores = noise.fbm(x / (2.5 * k), y / (2.5 * k), 3, size / (2.5 * k));
      const grain = noise.fbm(x / (18 * k), y / (18 * k), 4, size / (18 * k));
      const stain = noise.fbm(x / (90 * k) + 17, y / (90 * k), 4, size / (90 * k));
      height[y * size + x] = pores * 0.55 + grain * 0.45;
      const tone =
        (0.76 + (grain - 0.5) * 0.22 + (pores - 0.5) * 0.12) * (1 - smooth(0.52, 0.8, stain) * 0.3);
      const i = (y * size + x) * 4;
      colour[i] = colour[i + 1] = colour[i + 2] = tone * 255;
      colour[i + 3] = 255;
      const r = 0.52 + (1 - pores) * 0.18 + smooth(0.5, 0.8, stain) * 0.15;
      rough[i] = rough[i + 1] = rough[i + 2] = r * 255;
      rough[i + 3] = 255;
    }
  }
  return { size, colour, rough, normal: normals(height, size, 3.2 * k) };
}

/** Walnut with its grain running up the texture. */
function walnut(size: number, seed: number, light: number): SurfacePixels {
  const k = size / 512;
  const noise = new Noise(seed);
  const height = new Float32Array(size * size);
  const colour = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const cycles = (Math.PI * 2 * 22) / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = (noise.fbm(x / (64 * k), y / (128 * k), 3, 8) - 0.5) * 70 * k;
      const ring = Math.sin(
        (x + warp) * cycles + noise.fbm(x / (6 * k), y / (40 * k), 2, size / (6 * k)) * 2.4,
      );
      const fibre = noise.fbm(x / (1.5 * k), y / (30 * k), 2, size / (1.5 * k));
      const figure = 0.5 + ring * 0.5;
      height[y * size + x] = figure * 0.7 + fibre * 0.3;
      const blotch = noise.fbm(x / (80 * k) + 5, y / (80 * k), 3, size / (80 * k));
      const tone = (0.55 + figure * 0.35 + (fibre - 0.5) * 0.25) * (0.85 + blotch * 0.3) * light;
      const i = (y * size + x) * 4;
      colour[i] = 92 * tone;
      colour[i + 1] = 58 * tone;
      colour[i + 2] = 34 * tone;
      colour[i + 3] = 255;
      const r = 0.5 + (1 - figure) * 0.2 + fibre * 0.12;
      rough[i] = rough[i + 1] = rough[i + 2] = r * 255;
      rough[i + 3] = 255;
    }
  }
  return { size, colour, rough, normal: normals(height, size, 1.6 * k) };
}

/** Page edges seen end on: fine leaves, yellowed towards the outside. */
function edges(size: number): SurfacePixels {
  const noise = new Noise(11);
  const colour = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const leaf = 0.86 + noise.value(0, y * 1.7, 4096) * 0.14;
    for (let x = 0; x < size; x++) {
      const tone = leaf - noise.fbm(x / 40, y / 40, 3, size / 40) * 0.12;
      const i = (y * size + x) * 4;
      colour[i] = 232 * tone;
      colour[i + 1] = 218 * tone;
      colour[i + 2] = 186 * tone;
      colour[i + 3] = 255;
    }
  }
  return { size, colour };
}

/** A height field as a tangent-space normal map. */
function normals(height: Float32Array, size: number, strength: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = ((dx / length) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
      out[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
