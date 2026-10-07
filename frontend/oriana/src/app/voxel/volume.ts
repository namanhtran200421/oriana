import * as THREE from 'three';
import { Atlas, BLOCKS, BlockId, TileName } from './blocks';
import { Look, blockMaterial } from './shading';

/**
 * A box of blocks, lit the way a blocky world is lit (light from the sky
 * pouring down and spilling sideways, a step dimmer each block; light from
 * glowing blocks spreading the same way) and turned into meshes: only the
 * faces that can be seen, each corner darkened where blocks crowd it.
 */

const N_BLOCKS = BLOCKS.length;
/** Stops light and hides its neighbours' faces. */
const OPAQUE = new Uint8Array(N_BLOCKS);
/** Darkens the corners next to it. */
const OCCLUDES = new Uint8Array(N_BLOCKS);
/** How much more light it swallows, passing through. */
const FILTER = new Uint8Array(N_BLOCKS);
const EMITS = new Uint8Array(N_BLOCKS);
BLOCKS.forEach((def, id) => {
  if (!def) return;
  OPAQUE[id] = def.kind === 'solid' ? 1 : 0;
  OCCLUDES[id] = def.kind === 'solid' || (def.kind === 'cutout' && def.top !== 'glass') ? 1 : 0;
  FILTER[id] = def.kind === 'cutout' && def.top !== 'glass' ? 1 : def.kind === 'liquid' ? 2 : 0;
  EMITS[id] = def.light ?? 0;
});

/** Light level to brightness, as a blocky world reckons it: falling away fast in the dark. */
const BRIGHTNESS = Array.from({ length: 16 }, (_, l) => {
  const f = l / 15;
  return f / (4 - 3 * f);
});

/** Faces darker the further they turn from the sky. */
const SHADE = { top: 1, bottom: 0.5, x: 0.8, z: 0.68 };

interface Face {
  normal: readonly [number, number, number];
  /** One corner, and the two edges from it (u × v points out of the face). */
  origin: readonly [number, number, number];
  u: readonly [number, number, number];
  v: readonly [number, number, number];
  shade: number;
  which: 'top' | 'side' | 'bottom';
}

const FACES: readonly Face[] = [
  {
    normal: [1, 0, 0],
    origin: [1, 0, 1],
    u: [0, 0, -1],
    v: [0, 1, 0],
    shade: SHADE.x,
    which: 'side',
  },
  {
    normal: [-1, 0, 0],
    origin: [0, 0, 0],
    u: [0, 0, 1],
    v: [0, 1, 0],
    shade: SHADE.x,
    which: 'side',
  },
  {
    normal: [0, 1, 0],
    origin: [0, 1, 1],
    u: [1, 0, 0],
    v: [0, 0, -1],
    shade: SHADE.top,
    which: 'top',
  },
  {
    normal: [0, -1, 0],
    origin: [0, 0, 0],
    u: [1, 0, 0],
    v: [0, 0, 1],
    shade: SHADE.bottom,
    which: 'bottom',
  },
  {
    normal: [0, 0, 1],
    origin: [0, 0, 1],
    u: [1, 0, 0],
    v: [0, 1, 0],
    shade: SHADE.z,
    which: 'side',
  },
  {
    normal: [0, 0, -1],
    origin: [1, 0, 0],
    u: [-1, 0, 0],
    v: [0, 1, 0],
    shade: SHADE.z,
    which: 'side',
  },
];
/** The four corners of a face, as steps along u and v. */
const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

export interface MeshOptions {
  look: Look;
  atlas: Atlas;
  /** Columns per chunk, so what is off screen is skipped. */
  chunk?: number;
  /** Draw the faces on the volume's outer walls and floor (off by default: they are never seen). */
  walls?: boolean;
  /** A slight random lightening or darkening of each block, so no two alike. */
  jitter?: number;
  /** Materials from an earlier meshing of the same volume, to use again. */
  materials?: BlockMaterials;
}

export type BlockMaterials = Record<'solid' | 'leaves' | 'cutout' | 'liquid', THREE.ShaderMaterial>;

export class Volume {
  readonly blocks: Uint8Array;
  sky: Uint8Array;
  glow: Uint8Array;
  /** Extra glow, from things that are not blocks (a lantern on a desk, say). */
  private readonly lamps = new Map<number, number>();

  constructor(
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
    /** Where block (0, 0, 0) sits in the world. */
    readonly origin = new THREE.Vector3(),
  ) {
    const n = sx * sy * sz;
    this.blocks = new Uint8Array(n);
    this.sky = new Uint8Array(n);
    this.glow = new Uint8Array(n);
  }

  index(x: number, y: number, z: number): number {
    return (y * this.sz + z) * this.sx + x;
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.blocks[this.index(x, y, z)] : 0;
  }

  set(x: number, y: number, z: number, id: BlockId): void {
    if (this.inside(x, y, z)) this.blocks[this.index(x, y, z)] = id;
  }

  /** Sets a block only where there is air. */
  place(x: number, y: number, z: number, id: BlockId): void {
    if (this.inside(x, y, z) && !this.blocks[this.index(x, y, z)]) {
      this.blocks[this.index(x, y, z)] = id;
    }
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): void {
    for (let y = Math.max(0, y0); y <= Math.min(this.sy - 1, y1); y++) {
      for (let z = Math.max(0, z0); z <= Math.min(this.sz - 1, z1); z++) {
        for (let x = Math.max(0, x0); x <= Math.min(this.sx - 1, x1); x++) {
          this.blocks[this.index(x, y, z)] = id;
        }
      }
    }
  }

  /** The highest block that is not air in a column, or -1. */
  top(x: number, z: number, solidOnly = false): number {
    for (let y = this.sy - 1; y >= 0; y--) {
      const id = this.get(x, y, z);
      if (id && (!solidOnly || OPAQUE[id])) return y;
    }
    return -1;
  }

  isSolid(x: number, y: number, z: number): boolean {
    return OPAQUE[this.get(x, y, z)] === 1;
  }

  /** A glow at a cell from something that is not a block. */
  lamp(x: number, y: number, z: number, level: number): void {
    if (!this.inside(x, y, z)) return;
    const i = this.index(x, y, z);
    if (level > 0) this.lamps.set(i, level);
    else this.lamps.delete(i);
  }

  /** Works out the light everywhere: call once the building is done, and after changes. */
  light(): void {
    const { sx, sy, sz, blocks } = this;
    const n = sx * sy * sz;
    const sky = (this.sky = new Uint8Array(n));
    const glow = (this.glow = new Uint8Array(n));
    const layer = sx * sz;

    // Straight down from the sky, through anything clear.
    const tops = new Int16Array(layer);
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        let l = 15;
        let top = 0;
        for (let y = sy - 1; y >= 0; y--) {
          const i = (y * sz + z) * sx + x;
          const id = blocks[i];
          if (OPAQUE[id]) {
            top = Math.max(top, y + 1);
            break;
          }
          if (FILTER[id]) {
            l -= FILTER[id];
            top = Math.max(top, y + 1);
          }
          if (l <= 0) break;
          sky[i] = l;
        }
        tops[z * sx + x] = top;
      }
    }

    // Then sideways into overhangs and under trees: only from cells beside shade.
    const queue = new Ring(Math.min(n, 1 << 22));
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        let reach = tops[z * sx + x];
        if (x > 0) reach = Math.max(reach, tops[z * sx + x - 1]);
        if (x < sx - 1) reach = Math.max(reach, tops[z * sx + x + 1]);
        if (z > 0) reach = Math.max(reach, tops[(z - 1) * sx + x]);
        if (z < sz - 1) reach = Math.max(reach, tops[(z + 1) * sx + x]);
        for (let y = 0; y < reach; y++) {
          const i = (y * sz + z) * sx + x;
          if (sky[i] > 1) queue.push(i);
        }
      }
    }
    this.spread(sky, queue);

    for (let i = 0; i < n; i++) {
      if (EMITS[blocks[i]]) {
        glow[i] = EMITS[blocks[i]];
        queue.push(i);
      }
    }
    for (const [i, level] of this.lamps) {
      glow[i] = Math.max(glow[i], level);
      queue.push(i);
    }
    this.spread(glow, queue);
  }

  private spread(levels: Uint8Array, queue: Ring): void {
    const { sx, sy, sz, blocks } = this;
    const layer = sx * sz;
    while (queue.size) {
      const i = queue.shift();
      const l = levels[i];
      if (l <= 1) continue;
      const x = i % sx;
      const z = Math.floor(i / sx) % sz;
      const y = Math.floor(i / layer);
      const visit = (j: number) => {
        const id = blocks[j];
        if (OPAQUE[id]) return;
        const next = l - 1 - FILTER[id];
        if (next > levels[j]) {
          levels[j] = next;
          queue.push(j);
        }
      };
      if (x > 0) visit(i - 1);
      if (x < sx - 1) visit(i + 1);
      if (z > 0) visit(i - sx);
      if (z < sz - 1) visit(i + sx);
      if (y > 0) visit(i - layer);
      if (y < sy - 1) visit(i + layer);
    }
  }

  /** Sky and glow at a cell, outside the box counting as open sky. */
  private lightAt(x: number, y: number, z: number): [number, number] {
    if (!this.inside(x, y, z)) return [y < 0 ? 0 : 15, 0];
    const i = this.index(x, y, z);
    return [this.sky[i], this.glow[i]];
  }

  /** The brightness, 0 to 1, of the sky and of glowing things, at a point in the world. */
  brightnessAt(point: THREE.Vector3): [number, number] {
    const [s, g] = this.lightAt(
      Math.floor(point.x - this.origin.x),
      Math.floor(point.y - this.origin.y),
      Math.floor(point.z - this.origin.z),
    );
    return [BRIGHTNESS[s], BRIGHTNESS[g]];
  }

  /** The visible faces, in chunks, as meshes: solid, see-through-in-places, and water. */
  mesh(options: MeshOptions): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(this.origin);
    const size = options.chunk ?? 32;
    const materials: BlockMaterials = options.materials ?? {
      solid: blockMaterial(options.look, options.atlas.texture, 'solid'),
      leaves: blockMaterial(options.look, options.atlas.texture, 'leaves'),
      cutout: blockMaterial(options.look, options.atlas.texture, 'cutout'),
      liquid: blockMaterial(options.look, options.atlas.texture, 'liquid'),
    };
    for (let cz = 0; cz < this.sz; cz += size) {
      for (let cx = 0; cx < this.sx; cx += size) {
        const built = this.meshChunk(
          cx,
          cz,
          Math.min(cx + size, this.sx),
          Math.min(cz + size, this.sz),
          options,
        );
        for (const kind of ['solid', 'leaves', 'cutout', 'liquid'] as const) {
          const geometry = built[kind].geometry();
          if (!geometry) continue;
          const mesh = new THREE.Mesh(geometry, materials[kind]);
          mesh.name = kind;
          if (kind === 'liquid') mesh.renderOrder = 2;
          group.add(mesh);
        }
      }
    }
    group.userData['materials'] = materials;
    return group;
  }

  private meshChunk(x0: number, z0: number, x1: number, z1: number, options: MeshOptions) {
    const out = {
      solid: new Builder(),
      leaves: new Builder(),
      cutout: new Builder(),
      liquid: new Builder(),
    };
    const { atlas } = options;
    const walls = options.walls ?? false;
    const jitter = options.jitter ?? 0.06;
    const uvs = new Map<TileName, readonly number[]>();
    const uvOf = (tile: TileName) => {
      let uv = uvs.get(tile);
      if (!uv) uvs.set(tile, (uv = atlas.uv(tile)));
      return uv;
    };
    const neighbourId = (x: number, y: number, z: number) => {
      if (this.inside(x, y, z)) return this.blocks[this.index(x, y, z)];
      // The floor is never seen; the outer walls only where asked for.
      if (y < 0 || (!walls && y < this.sy)) return -1;
      return 0;
    };
    const occludes = (x: number, y: number, z: number) => OCCLUDES[this.get(x, y, z)] === 1;

    for (let y = 0; y < this.sy; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          const id = this.blocks[this.index(x, y, z)];
          if (!id) continue;
          const def = BLOCKS[id]!;
          const tone = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter;

          if (def.kind === 'cross') {
            this.cross(out.cutout, x, y, z, uvOf(def.side), tone);
            continue;
          }

          for (const face of FACES) {
            const [nx, ny, nz] = face.normal;
            const other = neighbourId(x + nx, y + ny, z + nz);
            if (other === -1) continue;
            if (!showFace(def.kind, id, other)) continue;

            const tile =
              face.which === 'top' ? def.top : face.which === 'bottom' ? def.bottom : def.side;
            const uv = uvOf(tile);
            const leaves = def.kind === 'cutout' && def.top !== 'glass';
            const builder =
              def.kind === 'liquid'
                ? out.liquid
                : leaves
                  ? out.leaves
                  : def.kind === 'cutout'
                    ? out.cutout
                    : out.solid;
            const fx = x + nx;
            const fy = y + ny;
            const fz = z + nz;
            // Water sits a little below the block above it.
            const sunk =
              def.kind === 'liquid' && BLOCKS[this.get(x, y + 1, z)]?.kind !== 'liquid' ? 0.12 : 0;

            const ao: number[] = [];
            const corners: number[][] = [];
            const swell: number[] = [];
            const foam: number[] = [];
            for (const [a, b] of CORNERS) {
              const su = a ? 1 : -1;
              const sv = b ? 1 : -1;
              const s1x = fx + face.u[0] * su;
              const s1y = fy + face.u[1] * su;
              const s1z = fz + face.u[2] * su;
              const s2x = fx + face.v[0] * sv;
              const s2y = fy + face.v[1] * sv;
              const s2z = fz + face.v[2] * sv;
              const cx = s1x + face.v[0] * sv;
              const cy = s1y + face.v[1] * sv;
              const cz = s1z + face.v[2] * sv;
              const side1 = occludes(s1x, s1y, s1z) ? 1 : 0;
              const side2 = occludes(s2x, s2y, s2z) ? 1 : 0;
              const corner = occludes(cx, cy, cz) ? 1 : 0;
              const level = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
              ao.push(level);

              // Smooth light: the average of the open cells round the corner.
              let sky = 0;
              let glow = 0;
              let count = 0;
              const add = (px: number, py: number, pz: number, open: boolean) => {
                if (!open) return;
                const [s, g] = this.lightAt(px, py, pz);
                sky += s;
                glow += g;
                count++;
              };
              add(fx, fy, fz, true);
              add(s1x, s1y, s1z, !side1);
              add(s2x, s2y, s2z, !side2);
              add(cx, cy, cz, !corner && !(side1 && side2));
              sky /= count;
              glow /= count;

              const px = x + face.origin[0] + face.u[0] * a + face.v[0] * b;
              let py = y + face.origin[1] + face.u[1] * a + face.v[1] * b;
              const pz = z + face.origin[2] + face.u[2] * a + face.v[2] * b;
              const surface = sunk > 0 && py > y + 0.5;
              if (surface) py -= sunk;
              corners.push([px, py, pz, sky, glow]);
              // The water's surface rises and falls; where it meets the shore, it foams.
              swell.push(surface ? 1 : 0);
              foam.push(surface && this.shore(px, y, pz) ? 1 : 0);
            }
            const shade = face.shade * tone;
            builder.quad(
              corners,
              uv,
              ao.map((level) => shade * AO[level]),
              def.kind === 'liquid' ? swell : leaves ? RUSTLE : STILL,
              ao[0] + ao[2] < ao[1] + ao[3],
              def.kind === 'liquid' ? foam : STILL,
            );
          }
        }
      }
    }
    return out;
  }

  /** Whether a corner of the water's surface (x, z on the grid) touches anything but water. */
  private shore(x: number, y: number, z: number): boolean {
    for (const [dx, dz] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ]) {
      const id = this.get(x + dx, y, z + dz);
      if (!this.inside(x + dx, y, z + dz)) continue;
      if (BLOCKS[id]?.kind !== 'liquid') return true;
    }
    return false;
  }

  /** A plant: two planes crossed, nudged a little off centre, its top free to sway. */
  private cross(
    builder: Builder,
    x: number,
    y: number,
    z: number,
    uv: readonly number[],
    tone: number,
  ) {
    const [sky, glow] = this.lightAt(x, y, z);
    const ox = (hash3(x, 7, z) - 0.5) * 0.4;
    const oz = (hash3(z, 3, x) - 0.5) * 0.4;
    const cx = x + 0.5 + ox;
    const cz = z + 0.5 + oz;
    const r = 0.45;
    const tall = 0.85 + hash3(x, y, z) * 0.25;
    for (const [dx, dz] of [
      [1, 1],
      [1, -1],
    ]) {
      const corners = [
        [cx - dx * r, y, cz - dz * r, sky, glow],
        [cx + dx * r, y, cz + dz * r, sky, glow],
        [cx + dx * r, y + tall, cz + dz * r, sky, glow],
        [cx - dx * r, y + tall, cz - dz * r, sky, glow],
      ];
      builder.quad(corners, uv, [0.78 * tone, 0.78 * tone, tone, tone], NOD, false);
    }
  }
}

/** Corner darkening, by how open the corner is (0 tucked in, 3 open). */
const AO = [0.48, 0.66, 0.84, 1];

function showFace(kind: string, id: number, other: number): boolean {
  if (!other) return true;
  const def = BLOCKS[other]!;
  if (def.kind === 'solid') return false;
  if (kind === 'liquid') return def.kind !== 'liquid';
  // Glass beside glass shows no seam; leaves beside leaves show all their tangle.
  if (kind === 'cutout') return other !== id || def.top !== 'glass';
  return true;
}

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Collects quads, and hands them over as geometry. */
class Builder {
  private readonly position: number[] = [];
  private readonly uv: number[] = [];
  private readonly tone: number[] = [];
  private readonly light: number[] = [];
  private readonly sway: number[] = [];
  private readonly foam: number[] = [];
  private readonly index: number[] = [];

  /**
   * corners: [x, y, z, sky, glow] four times, round the face; uv: the tile's
   * corners; tones: each corner's darkening; sway: how far each corner moves
   * in the wind; flip: split the quad along the other diagonal (so corner
   * shading does not crease).
   */
  quad(
    corners: number[][],
    uv: readonly number[],
    tones: readonly number[],
    sway: readonly number[],
    flip: boolean,
    foam: readonly number[] = STILL,
  ) {
    const base = this.position.length / 3;
    const [u0, v0, u1, v1] = uv;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    corners.forEach(([x, y, z, sky, glow], k) => {
      this.position.push(x, y, z);
      this.uv.push(uvs[k * 2], uvs[k * 2 + 1]);
      this.tone.push(tones[k]);
      this.light.push(interp(sky), interp(glow));
      this.sway.push(sway[k]);
      this.foam.push(foam[k]);
    });
    if (flip) this.index.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else this.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  geometry(): THREE.BufferGeometry | null {
    if (!this.index.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('tone', new THREE.Float32BufferAttribute(this.tone, 1));
    g.setAttribute('light', new THREE.Float32BufferAttribute(this.light, 2));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setAttribute('foam', new THREE.Float32BufferAttribute(this.foam, 1));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const STILL = [0, 0, 0, 0] as const;
const RUSTLE = [0.035, 0.035, 0.035, 0.035] as const;
/** A plant's foot stays put; its head nods. */
const NOD = [0, 0, 0.09, 0.09] as const;

/** Brightness for a level that falls between whole steps (an average of corners). */
function interp(level: number): number {
  const lo = Math.floor(level);
  const hi = Math.min(15, lo + 1);
  return BRIGHTNESS[lo] + (BRIGHTNESS[hi] - BRIGHTNESS[lo]) * (level - lo);
}

/** A first-in, first-out queue of cell numbers, round a fixed buffer. */
class Ring {
  private readonly buffer: Int32Array;
  private head = 0;
  private tail = 0;
  size = 0;

  constructor(capacity: number) {
    this.buffer = new Int32Array(capacity);
  }

  push(value: number): void {
    if (this.size === this.buffer.length) return;
    this.buffer[this.tail] = value;
    this.tail = (this.tail + 1) % this.buffer.length;
    this.size++;
  }

  shift(): number {
    const value = this.buffer[this.head];
    this.head = (this.head + 1) % this.buffer.length;
    this.size--;
    return value;
  }
}
