import { B, BlockId } from './blocks';
import type { Volume } from './volume';

/**
 * Trees and flowers, grown block by block into a volume. Each takes the block
 * its trunk stands on top of (x, y, z: the first block of trunk) and a
 * random source, so a world grows the same every visit.
 */

type Rand = () => number;

/** A round-cornered square of leaves, a layer of a canopy. */
function layer(
  v: Volume,
  x: number,
  y: number,
  z: number,
  r: number,
  leaf: BlockId,
  rand: Rand,
  ragged = 0.5,
) {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const corner = Math.abs(dx) === r && Math.abs(dz) === r;
      if (corner && (r === 1 || rand() < ragged)) continue;
      v.place(x + dx, y, z + dz, leaf);
    }
  }
}

/** An oak: a straight trunk under a squarish crown. */
export function oak(
  v: Volume,
  x: number,
  y: number,
  z: number,
  rand: Rand,
  tall = 4 + Math.floor(rand() * 3),
) {
  const top = y + tall;
  layer(v, x, top - 3, z, 2, B.OakLeaves, rand);
  layer(v, x, top - 2, z, 2, B.OakLeaves, rand);
  layer(v, x, top - 1, z, 1, B.OakLeaves, rand);
  v.place(x, top, z, B.OakLeaves);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    v.place(x + dx, top, z + dz, B.OakLeaves);
  }
  for (let k = 0; k < tall; k++) v.set(x, y + k, z, B.OakLog);
}

/** A bigger, rounder oak, for a tree to sit under. */
export function broadOak(v: Volume, x: number, y: number, z: number, rand: Rand) {
  const tall = 6 + Math.floor(rand() * 2);
  const crown = y + tall - 1;
  blob(v, x, crown, z, 3.6, 2.6, 3.6, B.OakLeaves, rand);
  for (let k = 0; k < tall; k++) v.set(x, y + k, z, B.OakLog);
  // Two boughs, reaching out under the leaves.
  for (const [dx, dz] of [
    [1, 0],
    [0, -1],
  ]) {
    v.set(x + dx, crown - 1, z + dz, B.OakLog);
    v.set(x + dx * 2, crown, z + dz * 2, B.OakLog);
  }
}

/** A cherry: a short trunk that forks and leans, under wide clouds of pink with blossom hanging down. */
export function cherry(v: Volume, x: number, y: number, z: number, rand: Rand) {
  const tall = 3 + Math.floor(rand() * 2);
  for (let k = 0; k < tall; k++) v.set(x, y + k, z, B.CherryLog);
  const angle = rand() * Math.PI * 2;
  const forks = rand() < 0.6 ? 2 : 1;
  for (let f = 0; f < forks; f++) {
    const a = angle + f * (Math.PI * (0.8 + rand() * 0.4));
    const dx = Math.round(Math.cos(a));
    const dz = Math.round(Math.sin(a));
    let bx = x;
    let by = y + tall - 1;
    let bz = z;
    const reach = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < reach; k++) {
      bx += dx;
      bz += dz;
      by += 1;
      v.set(bx, by, bz, B.CherryLog);
      v.set(bx, by - 1, bz, B.CherryLog);
    }
    by += 1;
    v.set(bx, by, bz, B.CherryLog);
    const r = 3 + rand() * 0.8;
    blob(v, bx, by + 1, bz, r, 1.8, r, B.CherryLeaves, rand);
    // Blossom hanging from the canopy's rim.
    for (let k = 0; k < 10; k++) {
      const t = rand() * Math.PI * 2;
      const hx = Math.round(bx + Math.cos(t) * (r - 0.6));
      const hz = Math.round(bz + Math.sin(t) * (r - 0.6));
      const drop = 1 + Math.floor(rand() * 2);
      for (let d = 1; d <= drop; d++) v.place(hx, by - d + 1, hz, B.CherryLeaves);
    }
  }
}

/** A spruce: a tall trunk in tiers of dark needles, narrowing to a point. */
export function spruce(
  v: Volume,
  x: number,
  y: number,
  z: number,
  rand: Rand,
  tall = 7 + Math.floor(rand() * 4),
) {
  const top = y + tall;
  v.place(x, top + 1, z, B.SpruceLeaves);
  v.place(x, top, z, B.SpruceLeaves);
  const radii = [1, 0, 1, 2, 1, 2, 3, 2, 3];
  let r = 0;
  for (let k = 0; top - 1 - k > y + 1; k++) {
    r = radii[Math.min(k, radii.length - 1)] - (tall < 8 && k > 5 ? 1 : 0);
    if (k >= radii.length) r = k % 2 ? 2 : 3;
    if (r > 0) layer(v, x, top - 1 - k, z, r, B.SpruceLeaves, rand, 0.9);
    else v.place(x, top - 1 - k, z, B.SpruceLeaves);
  }
  for (let k = 0; k < tall; k++) v.set(x, y + k, z, B.SpruceLog);
}

/** A low tuft of leaves. */
export function bush(v: Volume, x: number, y: number, z: number, leaf: BlockId, rand: Rand) {
  v.place(x, y, z, leaf);
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    if (rand() < 0.75) v.place(x + dx, y, z + dz, leaf);
  }
  if (rand() < 0.5) v.place(x, y + 1, z, leaf);
}

/** Every cell within an ellipsoid, the rim a little ragged. */
export function blob(
  v: Volume,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  leaf: BlockId,
  rand: Rand,
) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
        if (d > 1) continue;
        if (d > 0.7 && rand() < 0.3) continue;
        v.place(x, y, z, leaf);
      }
    }
  }
}

/** The ground block under a column: the top one if it is grass (or snowy grass). */
export function grassAt(v: Volume, x: number, z: number): number {
  const y = v.top(x, z);
  const id = v.get(x, y, z);
  return id === B.Grass || id === B.SnowyGrass ? y : -1;
}

/**
 * An island afloat: a grassy top a little uneven, its underside hanging in a
 * rough cone of dirt and stone. (x, y, z) is the middle of its top.
 * Returns the height of its top at a column, or -1 off its edge.
 */
export function island(
  v: Volume,
  x: number,
  y: number,
  z: number,
  radius: number,
  rand: Rand,
): (dx: number, dz: number) => number {
  const bumps = Array.from({ length: 6 }, () => [rand() * Math.PI * 2, 0.12 + rand() * 0.16]);
  const edge = (a: number) =>
    radius * (1 + bumps.reduce((s, [p, k], i) => s + Math.sin(a * (i + 2) + p) * k * 0.5, 0));
  const tops = new Map<number, number>();
  const r = Math.ceil(radius * 1.4);
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dz);
      const reach = edge(Math.atan2(dz, dx));
      if (d > reach) continue;
      const inner = 1 - d / reach;
      // Small islands are a little lumpy on top; big ones are level enough to stand on.
      const top = y + (radius < 7 && inner > 0.55 && rand() < 0.3 ? 1 : 0);
      const depth = Math.round(2 + inner * radius * 1.3 + rand() * 2);
      for (let k = 0; k <= depth; k++) {
        const id =
          k === 0 ? B.Grass : k < 3 ? B.Dirt : k < depth - 1 || rand() < 0.5 ? B.Stone : B.Cobble;
        v.set(x + dx, top - k, z + dz, id);
      }
      tops.set((dz + 64) * 128 + dx + 64, top);
    }
  }
  return (dx, dz) => tops.get((dz + 64) * 128 + dx + 64) ?? -1;
}
