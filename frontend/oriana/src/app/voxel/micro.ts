import * as THREE from 'three';

/**
 * Small models built from little coloured cubes: a flower taller than a
 * person, a wishing star, a cow. Drawn up by hand (or as rows of letters,
 * one letter a colour) and turned into one mesh, with only the outer faces
 * kept and each corner shaded the way the world's blocks are.
 */

interface Cell {
  colour: THREE.Color;
  glow: number;
}

/** A colour, and (optionally) how much it glows: '#ffd36b' or ['#ffd36b', 1]. */
export type Paint = string | readonly [string, number];

const SHADE = [0.8, 0.8, 1, 0.55, 0.7, 0.7];
const FACES = [
  { n: [1, 0, 0], o: [1, 0, 1], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], o: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], o: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], o: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], o: [1, 0, 0], u: [-1, 0, 0], v: [0, 1, 0] },
] as const;
const AO = [0.55, 0.72, 0.87, 1];

export class Micro {
  private readonly cells = new Map<number, Cell>();
  private readonly colours = new Map<string, THREE.Color>();

  private static key(x: number, y: number, z: number): number {
    return ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
  }

  private colour(hex: string): THREE.Color {
    let c = this.colours.get(hex);
    if (!c) this.colours.set(hex, (c = new THREE.Color(hex)));
    return c;
  }

  put(x: number, y: number, z: number, paint: Paint): this {
    const [hex, glow] = typeof paint === 'string' ? [paint, 0] : paint;
    this.cells.set(Micro.key(x, y, z), { colour: this.colour(hex), glow });
    return this;
  }

  clear(x: number, y: number, z: number): this {
    this.cells.delete(Micro.key(x, y, z));
    return this;
  }

  has(x: number, y: number, z: number): boolean {
    return this.cells.has(Micro.key(x, y, z));
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, paint: Paint): this {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.put(x, y, z, paint);
    }
    return this;
  }

  /** A rounded lump: every cell within the ellipsoid. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, paint: Paint): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (d <= 1) this.put(x, y, z, paint);
        }
      }
    }
    return this;
  }

  /**
   * A picture drawn in letters, standing upright (rows top to bottom, in the
   * x–y plane) and `depth` cells thick, starting at z. Spaces and dots are empty.
   */
  picture(
    rows: readonly string[],
    palette: Record<string, Paint>,
    x0: number,
    y0: number,
    z0 = 0,
    depth = 1,
  ): this {
    rows.forEach((row, r) => {
      const y = y0 + rows.length - 1 - r;
      [...row].forEach((ch, c) => {
        const paint = palette[ch];
        if (!paint) return;
        for (let d = 0; d < depth; d++) this.put(x0 + c, y, z0 + d, paint);
      });
    });
    return this;
  }

  /** Layers of letters, from the bottom up; each layer's rows run from back (−z) to front. */
  layers(
    stack: readonly (readonly string[])[],
    palette: Record<string, Paint>,
    x0 = 0,
    y0 = 0,
    z0 = 0,
  ): this {
    stack.forEach((rows, layer) => {
      rows.forEach((row, r) => {
        [...row].forEach((ch, c) => {
          const paint = palette[ch];
          if (paint) this.put(x0 + c, y0 + layer, z0 + r, paint);
        });
      });
    });
    return this;
  }

  get size(): number {
    return this.cells.size;
  }

  /**
   * One mesh's worth of faces, each cell `scale` across. Centred across x and z,
   * standing on y = 0 unless `centre` is given.
   */
  geometry(
    scale: number,
    options: { centre?: THREE.Vector3Like; jitter?: number } = {},
  ): THREE.BufferGeometry {
    const jitter = options.jitter ?? 0.05;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const entries: [number, number, number, Cell][] = [];
    for (const [key, cell] of this.cells) {
      const x = ((key >> 20) & 1023) - 512;
      const y = ((key >> 10) & 1023) - 512;
      const z = (key & 1023) - 512;
      entries.push([x, y, z, cell]);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + 1);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z + 1);
    }
    const centre = options.centre ?? { x: (minX + maxX) / 2, y: minY, z: (minZ + maxZ) / 2 };

    const position: number[] = [];
    const tint: number[] = [];
    const glow: number[] = [];
    const index: number[] = [];
    const solid = (x: number, y: number, z: number) => this.cells.has(Micro.key(x, y, z));

    for (const [x, y, z, cell] of entries) {
      const tone = 1 + (hash(x, y, z) - 0.5) * 2 * jitter;
      FACES.forEach((face, f) => {
        const fx = x + face.n[0];
        const fy = y + face.n[1];
        const fz = z + face.n[2];
        if (solid(fx, fy, fz)) return;
        const base = position.length / 3;
        const ao: number[] = [];
        for (const [a, b] of [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]) {
          const su = a ? 1 : -1;
          const sv = b ? 1 : -1;
          const s1 = solid(fx + face.u[0] * su, fy + face.u[1] * su, fz + face.u[2] * su) ? 1 : 0;
          const s2 = solid(fx + face.v[0] * sv, fy + face.v[1] * sv, fz + face.v[2] * sv) ? 1 : 0;
          const c = solid(
            fx + face.u[0] * su + face.v[0] * sv,
            fy + face.u[1] * su + face.v[1] * sv,
            fz + face.u[2] * su + face.v[2] * sv,
          )
            ? 1
            : 0;
          const level = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
          ao.push(level);
          position.push(
            (x + face.o[0] + face.u[0] * a + face.v[0] * b - centre.x) * scale,
            (y + face.o[1] + face.u[1] * a + face.v[1] * b - centre.y) * scale,
            (z + face.o[2] + face.u[2] * a + face.v[2] * b - centre.z) * scale,
          );
          // Glowing cells are not shaded: they are lit from within.
          const shade = cell.glow ? 1 : SHADE[f] * AO[level] * tone;
          tint.push(cell.colour.r * shade, cell.colour.g * shade, cell.colour.b * shade);
          glow.push(cell.glow);
        }
        if (ao[0] + ao[2] < ao[1] + ao[3])
          index.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        else index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
    geometry.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

function hash(x: number, y: number, z: number): number {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
