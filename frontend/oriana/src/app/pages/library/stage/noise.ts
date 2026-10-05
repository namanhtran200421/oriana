/**
 * Seeded value noise and fractal sums of it: the raw material for every
 * surface in the reading room. Tileable when asked, so textures repeat
 * without seams.
 */
export class Noise {
  private readonly perm: Uint8Array;

  constructor(seed = 1) {
    const rand = mulberry(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Value noise in [0, 1]. With `period`, it wraps every `period` units. */
  value(x: number, y: number, period = 256): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const at = (i: number, j: number) => {
      const a = (((i % period) + period) % period) & 255;
      const b = (((j % period) + period) % period) & 255;
      return this.perm[this.perm[a] + b] / 255;
    };
    const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u;
    const bottom = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return top + (bottom - top) * v;
  }

  /** Fractal sum over `octaves`, normalised to [0, 1]. */
  fbm(x: number, y: number, octaves = 4, period = 256): number {
    let sum = 0;
    let amplitude = 0.5;
    let total = 0;
    let frequency = 1;
    for (let i = 0; i < octaves; i++) {
      sum += this.value(x * frequency, y * frequency, period * frequency) * amplitude;
      total += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return sum / total;
  }
}

export function mulberry(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
