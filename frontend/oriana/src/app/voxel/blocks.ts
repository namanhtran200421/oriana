import * as THREE from 'three';
import { mulberry } from './noise';

/**
 * The blocks the worlds are built from, and their textures: all of them
 * painted here, pixel by pixel, sixteen to a side, in the spirit of a
 * blocky sandbox game but every pixel our own.
 */

export type RGBA = readonly [number, number, number, number];

export const rgb = (hex: string, alpha = 255): RGBA => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
};

const S = 16;

/** One sixteen-by-sixteen tile of pixels. */
export class Tile {
  readonly data = new Uint8ClampedArray(S * S * 4);

  set(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    this.data.set(c, (y * S + x) * 4);
  }

  get(x: number, y: number): RGBA {
    const i = (y * S + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  /** Every pixel one of the palette's colours, picked at random (optionally weighted). */
  speckle(palette: readonly RGBA[], rand: () => number, weights?: readonly number[]): void {
    const total = weights?.reduce((a, b) => a + b, 0) ?? palette.length;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) this.set(x, y, pickWeighted(palette, rand, weights, total));
    }
  }

  /** Lightens (above 1) or darkens (below 1) one pixel. */
  tint(x: number, y: number, f: number): void {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const [r, g, b, a] = this.get(x, y);
    this.set(x, y, [r * f, g * f, b * f, a]);
  }
}

function pickWeighted(
  palette: readonly RGBA[],
  rand: () => number,
  weights: readonly number[] | undefined,
  total: number,
): RGBA {
  if (!weights) return palette[Math.floor(rand() * palette.length)];
  let roll = rand() * total;
  for (let i = 0; i < palette.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return palette[i];
  }
  return palette[palette.length - 1];
}

const pal = (...hexes: string[]) => hexes.map((h) => rgb(h));
const CLEAR: RGBA = [0, 0, 0, 0];

// ---------------------------------------------------------------------------
// The painters.
// ---------------------------------------------------------------------------

const GRASS = pal('#5d9b38', '#6aab40', '#79bd4a', '#548c31');
const DIRT = pal('#866043', '#79563a', '#966c4a', '#6c4c33');

function grassTop(t: Tile, r: () => number) {
  t.speckle(GRASS, r, [3, 3, 2, 2]);
  for (let k = 0; k < 10; k++) t.set(Math.floor(r() * S), Math.floor(r() * S), rgb('#8fd35c'));
}

function dirt(t: Tile, r: () => number) {
  t.speckle(DIRT, r, [3, 3, 2, 2]);
  for (let k = 0; k < 7; k++) t.set(Math.floor(r() * S), Math.floor(r() * S), rgb('#5a3f2c'));
  for (let k = 0; k < 4; k++) t.set(Math.floor(r() * S), Math.floor(r() * S), rgb('#a98a6b'));
}

/** Dirt beneath a fringe of something on top (grass, snow), ragged along its lower edge. */
function fringed(top: readonly RGBA[], depth: number) {
  return (t: Tile, r: () => number) => {
    dirt(t, r);
    for (let x = 0; x < S; x++) {
      const d = depth + (r() < 0.5 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
      for (let y = 0; y < d; y++) t.set(x, y, top[Math.floor(r() * top.length)]);
    }
  };
}

function stone(t: Tile, r: () => number) {
  t.speckle(pal('#7f7f7f', '#8b8b8b', '#747474', '#999999'), r, [4, 3, 2, 1]);
  for (let k = 0; k < 4; k++) {
    let x = Math.floor(r() * S);
    let y = Math.floor(r() * S);
    for (let n = 0; n < 3 + Math.floor(r() * 3); n++) {
      t.set(x, y, rgb('#606060'));
      x += r() < 0.5 ? 1 : 0;
      y += r() < 0.5 ? 1 : -1;
    }
  }
}

/** Rounded stones set in dark mortar. */
function cobble(t: Tile, r: () => number) {
  const seeds = Array.from({ length: 9 }, () => [r() * S, r() * S, Math.floor(r() * 4)]);
  const tones = pal('#929292', '#7b7b7b', '#a2a2a2', '#6f6f6f');
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let best = Infinity;
      let second = Infinity;
      let tone = 0;
      for (const [sx, sy, k] of seeds) {
        // Wrap round, so the tile repeats without a seam.
        const dx = Math.min(Math.abs(x - sx), S - Math.abs(x - sx));
        const dy = Math.min(Math.abs(y - sy), S - Math.abs(y - sy));
        const d = Math.hypot(dx, dy);
        if (d < best) {
          second = best;
          best = d;
          tone = k;
        } else if (d < second) second = d;
      }
      t.set(x, y, second - best < 1.1 ? rgb('#4c4c4c') : tones[tone]);
      if (second - best >= 1.1 && r() < 0.15) t.tint(x, y, 1.12);
    }
  }
}

function sand(t: Tile, r: () => number) {
  t.speckle(pal('#e2d6a2', '#d9cb93', '#ebe0b0', '#cfc186'), r);
}

const SNOW = pal('#f5f9fc', '#ffffff', '#e8f0f7', '#dde8f2');

function snow(t: Tile, r: () => number) {
  t.speckle(SNOW, r, [4, 3, 2, 1]);
}

function gravel(t: Tile, r: () => number) {
  t.speckle(pal('#8a817c', '#76706b', '#9d9590', '#635c58', '#a39a8a'), r);
  for (let k = 0; k < 10; k++) {
    const x = Math.floor(r() * S);
    const y = Math.floor(r() * S);
    t.set(x, y, rgb('#4e4844'));
    t.set(x + 1, y, rgb('#b5aea6'));
  }
}

function path(t: Tile, r: () => number) {
  t.speckle(pal('#a98a5c', '#9b7c50', '#b8996a', '#8f7148'), r);
}

/** Bark running up the side of a log: a colour to each column, with dark grooves. */
function bark(colours: readonly RGBA[], groove: RGBA) {
  return (t: Tile, r: () => number) => {
    for (let x = 0; x < S; x++) {
      const base = colours[Math.floor(r() * colours.length)];
      for (let y = 0; y < S; y++) {
        t.set(x, y, base);
        if (r() < 0.12) t.tint(x, y, r() < 0.5 ? 0.88 : 1.1);
      }
      if (r() < 0.3) {
        const from = Math.floor(r() * S);
        for (let y = from; y < from + 4 + Math.floor(r() * 6); y++) t.set(x, y % S, groove);
      }
    }
  };
}

/** The cut end of a log: rings of light and dark wood inside a band of bark. */
function rings(light: RGBA, dark: RGBA, edge: RGBA) {
  return (t: Tile, r: () => number) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        t.set(x, y, d > 6.6 ? edge : Math.floor(d) % 2 ? dark : light);
        if (r() < 0.08) t.tint(x, y, 0.92);
      }
    }
  };
}

/** Four boards across, seams between, a joint in each board. */
function planks(colours: readonly RGBA[], seam: RGBA) {
  return (t: Tile, r: () => number) => {
    for (let board = 0; board < 4; board++) {
      const base = colours[board % colours.length];
      const joint = Math.floor(r() * S);
      for (let y = board * 4; y < board * 4 + 4; y++) {
        for (let x = 0; x < S; x++) {
          t.set(x, y, base);
          if (r() < 0.14) t.tint(x, y, r() < 0.5 ? 0.92 : 1.07);
        }
      }
      for (let x = 0; x < S; x++) t.set(x, board * 4 + 3, seam);
      for (let y = board * 4; y < board * 4 + 3; y++) t.set(joint, y, seam);
    }
  };
}

/**
 * Leaves, with holes to see through: clumps of a few tones (not every pixel
 * its own), lit from the top left, darker underneath.
 */
function leaves(colours: readonly RGBA[], holes: number) {
  return (t: Tile, r: () => number) => {
    const base = colours[0];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) t.set(x, y, base);
    // Clumps of the other tones, two or three pixels across.
    for (let k = 0; k < 22; k++) {
      const c = colours[1 + Math.floor(r() * (colours.length - 1))];
      const x = Math.floor(r() * S);
      const y = Math.floor(r() * S);
      const w = 1 + Math.floor(r() * 2);
      const h = 1 + Math.floor(r() * 2);
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) t.set((x + dx) % S, (y + dy) % S, c);
    }
    // A highlight above each clump of shadow, and the holes.
    for (let k = 0; k < 14; k++) {
      const x = Math.floor(r() * S);
      const y = 1 + Math.floor(r() * (S - 1));
      t.tint(x, y, 0.82);
      t.tint(x, y - 1, 1.12);
    }
    for (let k = 0; k < Math.round(S * S * holes); k++) {
      t.set(Math.floor(r() * S), Math.floor(r() * S), CLEAR);
    }
  };
}

function water(t: Tile, r: () => number) {
  t.speckle(pal('#3d74e0', '#4a82ea', '#3567d3', '#4680e6'), r);
  for (let k = 0; k < 7; k++) {
    const x = Math.floor(r() * S);
    const y = Math.floor(r() * S);
    for (let n = 0; n < 3; n++) t.set(x + n, y, rgb('#7fb0ff'));
  }
}

function glass(t: Tile, r: () => number) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) t.set(x, y, CLEAR);
  const frame = rgb('#d7eef7', 235);
  for (let i = 0; i < S; i++) {
    t.set(i, 0, frame);
    t.set(i, S - 1, frame);
    t.set(0, i, frame);
    t.set(S - 1, i, frame);
  }
  const glint = rgb('#ffffff', 170);
  for (const [x, y] of [
    [3, 4],
    [4, 3],
    [5, 2],
    [10, 12],
    [11, 11],
  ]) {
    t.set(x, y, glint);
  }
  if (r() < 2) t.set(12, 3, rgb('#ffffff', 120));
}

const BOOK_COLOURS = pal(
  '#8b2635',
  '#2d5a8b',
  '#3d7a3a',
  '#6b3d7a',
  '#b05a2b',
  '#2a3a6b',
  '#8a6a2a',
  '#a13a5a',
);

/** Shelves of books between boards: the library's own wallpaper. */
function bookshelf(t: Tile, r: () => number) {
  planks(pal('#b8945f', '#a98552'), rgb('#7d5f37'))(t, r);
  const shelf = (top: number, bottom: number) => {
    let x = 0;
    while (x < S) {
      const w = r() < 0.6 ? 2 : 1;
      if (r() < 0.12) {
        for (let y = top; y <= bottom; y++) t.set(x, y, rgb('#2c1c10'));
        x += 1;
        continue;
      }
      const c = BOOK_COLOURS[Math.floor(r() * BOOK_COLOURS.length)];
      const short = r() < 0.35 ? 1 : 0;
      for (let dx = 0; dx < w && x + dx < S; dx++) {
        for (let y = top; y <= bottom; y++) {
          t.set(x + dx, y, y < top + short ? rgb('#2c1c10') : c);
          if (dx === 0) t.tint(x + dx, y, 1.15);
          if (dx === w - 1 && w > 1) t.tint(x + dx, y, 0.8);
        }
        if (r() < 0.5) t.set(x + dx, top + short + 1, rgb('#d9b45a'));
      }
      x += w;
    }
  };
  shelf(1, 6);
  shelf(9, 14);
  for (let x = 0; x < S; x++) {
    t.set(x, 0, rgb('#7d5f37'));
    t.set(x, 7, rgb('#a98552'));
    t.set(x, 8, rgb('#7d5f37'));
    t.set(x, 15, rgb('#7d5f37'));
  }
}

function wool(hex: string) {
  const base = rgb(hex);
  return (t: Tile, r: () => number) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        t.set(x, y, base);
        const weave = (x + y) % 4 === 0 ? 0.93 : (x - y + 16) % 4 === 0 ? 1.04 : 1;
        t.tint(x, y, weave * (0.95 + r() * 0.08));
      }
    }
  };
}

function glowstone(t: Tile, r: () => number) {
  t.speckle(pal('#fbe4a0', '#f7c96a', '#ffd987', '#e8b04f', '#fff2c4'), r, [3, 3, 3, 2, 1]);
  for (let k = 0; k < 18; k++) t.set(Math.floor(r() * S), Math.floor(r() * S), rgb('#b77d36'));
}

function bricks(face: readonly RGBA[], mortar: RGBA, wide = 8) {
  return (t: Tile, r: () => number) => {
    for (let y = 0; y < S; y++) {
      const row = Math.floor(y / 4);
      const offset = row % 2 ? wide / 2 : 0;
      for (let x = 0; x < S; x++) {
        const brick = Math.floor((x + offset) / wide);
        const c = face[(brick + row * 3) % face.length];
        const seam = y % 4 === 3 || (x + offset) % wide === wide - 1;
        t.set(x, y, seam ? mortar : c);
        if (!seam && r() < 0.1) t.tint(x, y, 0.92);
      }
    }
  };
}

function haySide(t: Tile, r: () => number) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      t.set(x, y, [rgb('#d6b13e'), rgb('#c9a234'), rgb('#e3c052')][(x + Math.floor(r() * 2)) % 3]);
    }
  }
  for (const y of [2, 3, 12, 13]) for (let x = 0; x < S; x++) t.set(x, y, rgb('#8a5a2b'));
}

function hayTop(t: Tile, r: () => number) {
  t.speckle(pal('#d6b13e', '#c9a234', '#e3c052', '#b89128'), r);
}

// --- Flowers and grass: drawn on clear tiles, to stand as crossed planes ---

function stem(t: Tile, top: number, leafy = true) {
  const green = rgb('#3f7f2a');
  const light = rgb('#5aa23a');
  for (let y = top; y < S; y++) t.set(7, y, y % 3 ? green : light);
  if (leafy) {
    for (const [x, y] of [
      [6, 12],
      [5, 11],
      [8, 10],
      [9, 9],
      [10, 9],
    ]) {
      t.set(x, y, light);
    }
  }
}

function clearTile(t: Tile) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) t.set(x, y, CLEAR);
}

/** A rose: deep red petals round a darker heart. */
function rose(petals: readonly RGBA[], heart: RGBA) {
  return (t: Tile, r: () => number) => {
    clearTile(t);
    stem(t, 7);
    const rows: [number, number, number][] = [
      [2, 6, 9],
      [3, 5, 10],
      [4, 5, 10],
      [5, 5, 10],
      [6, 6, 9],
    ];
    for (const [y, x0, x1] of rows) {
      for (let x = x0; x <= x1; x++) t.set(x, y, petals[Math.floor(r() * petals.length)]);
    }
    t.set(7, 4, heart);
    t.set(8, 4, heart);
    t.set(7, 3, heart);
  };
}

/** A cornflower: a ragged ring of blue round a dark eye. */
function cornflower(t: Tile, r: () => number) {
  clearTile(t);
  stem(t, 7);
  const blues = pal('#4f8fe8', '#6aa6f2', '#3a74d0', '#83b8f6');
  for (const [x, y] of [
    [7, 1],
    [5, 2],
    [9, 2],
    [4, 4],
    [10, 4],
    [5, 6],
    [9, 6],
    [6, 3],
    [8, 3],
    [6, 5],
    [8, 5],
    [5, 4],
    [9, 4],
    [7, 6],
    [6, 2],
    [8, 2],
  ]) {
    t.set(x, y, blues[Math.floor(r() * blues.length)]);
  }
  t.set(7, 4, rgb('#22408a'));
  t.set(7, 3, rgb('#22408a'));
  t.set(6, 4, rgb('#3058b0'));
  t.set(8, 4, rgb('#3058b0'));
}

function daisy(t: Tile) {
  clearTile(t);
  stem(t, 7);
  const white = rgb('#fbfbf7');
  const shade = rgb('#dfe2e8');
  for (const [x, y] of [
    [7, 1],
    [7, 2],
    [4, 4],
    [5, 4],
    [9, 4],
    [10, 4],
    [7, 6],
    [7, 7],
    [5, 2],
    [9, 2],
    [5, 6],
    [9, 6],
  ]) {
    t.set(x, y, y > 4 ? shade : white);
  }
  for (const [x, y] of [
    [6, 3],
    [7, 3],
    [8, 3],
    [6, 4],
    [7, 4],
    [8, 4],
    [6, 5],
    [7, 5],
    [8, 5],
  ]) {
    t.set(x, y, rgb(x === 7 && y === 4 ? '#e0a020' : '#f4c63a'));
  }
}

function dandelion(t: Tile) {
  clearTile(t);
  stem(t, 9);
  for (let y = 5; y <= 8; y++) {
    for (let x = 6; x <= 9; x++) {
      if ((x === 6 || x === 9) && (y === 5 || y === 8)) continue;
      t.set(x, y, rgb((x + y) % 2 ? '#f6d743' : '#e8c22f'));
    }
  }
}

function allium(t: Tile, r: () => number) {
  clearTile(t);
  stem(t, 7, false);
  const purples = pal('#b57ae0', '#9c5fd0', '#c995ee', '#8a4fc0');
  for (let y = 1; y <= 6; y++) {
    for (let x = 5; x <= 10; x++) {
      if (Math.hypot(x - 7.5, y - 3.5) > 2.9) continue;
      t.set(x, y, purples[Math.floor(r() * purples.length)]);
    }
  }
}

function tulip(petals: readonly RGBA[]) {
  return (t: Tile, r: () => number) => {
    clearTile(t);
    stem(t, 8);
    for (let y = 3; y <= 8; y++) {
      for (let x = 5; x <= 10; x++) {
        const notch = y === 3 && (x === 7 || x === 8);
        const side = y > 6 && (x === 5 || x === 10);
        if (notch || side) continue;
        t.set(x, y, petals[Math.floor(r() * petals.length)]);
      }
    }
    for (let y = 4; y <= 7; y++) t.tint(5, y, 0.85);
  };
}

/** Ripe wheat: golden stalks, heads heavy and pale. */
function wheat(t: Tile, r: () => number) {
  clearTile(t);
  const stalks = pal('#c9a234', '#b8902a', '#d6b13e');
  for (let x = 1; x < S; x += 2 + Math.floor(r() * 2)) {
    const top = 2 + Math.floor(r() * 4);
    const lean = r() < 0.5 ? 0 : 1;
    for (let y = S - 1; y >= top; y--)
      t.set(x + (y < top + 3 ? lean : 0), y, stalks[Math.floor(r() * 3)]);
    for (let y = top; y < top + 4; y++) {
      t.set(x + lean, y, rgb('#e8c95a'));
      t.set(x + lean + (y % 2 ? 1 : -1), y, rgb('#f2d878'));
    }
  }
}

/** Tilled earth: dark furrows, damp. */
function farmland(t: Tile, r: () => number) {
  t.speckle(pal('#5a3b22', '#4e321c', '#634229', '#46301b'), r);
  for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x++) t.set(x, y, rgb('#3a2414'));
}

function tuft(t: Tile, r: () => number) {
  clearTile(t);
  const greens = pal('#5aa23a', '#4d8f2f', '#6ab544', '#3f7f2a');
  for (let k = 0; k < 7; k++) {
    let x = 2 + Math.floor(r() * 12);
    const height = 5 + Math.floor(r() * 8);
    for (let y = S - 1; y > S - 1 - height; y--) {
      t.set(x, y, greens[Math.floor(r() * greens.length)]);
      if (r() < 0.25) x += r() < 0.5 ? 1 : -1;
    }
  }
}

// ---------------------------------------------------------------------------
// The atlas, and the blocks themselves.
// ---------------------------------------------------------------------------

const PAINTERS = {
  grassTop,
  grassSide: fringed(GRASS, 3),
  dirt,
  stone,
  cobble,
  sand,
  snow,
  snowSide: fringed(SNOW, 4),
  gravel,
  path,
  oakLog: bark(pal('#6b5134', '#5f472c', '#765a3a'), rgb('#4a3722')),
  oakLogTop: rings(rgb('#b8945f'), rgb('#a07c4a'), rgb('#5f472c')),
  oakPlanks: planks(pal('#b8945f', '#a98552', '#c29e68', '#ae8a56'), rgb('#7d5f37')),
  oakLeaves: leaves(pal('#4a9430', '#3f8a26', '#57a63a', '#36791f'), 0.1),
  spruceLog: bark(pal('#3e2a17', '#4a331d', '#35230f'), rgb('#24180b')),
  spruceLogTop: rings(rgb('#7d5935'), rgb('#6a4b2c'), rgb('#3e2a17')),
  sprucePlanks: planks(pal('#755533', '#6a4b2c', '#82603a', '#704f2e'), rgb('#4b3420')),
  spruceLeaves: leaves(pal('#305f36', '#2a5530', '#3a6d40', '#244a2a'), 0.08),
  cherryLog: bark(pal('#3b1f2b', '#4a2836', '#2f1822'), rgb('#1f0f17')),
  cherryLogTop: rings(rgb('#e6b3a8'), rgb('#d49a8f'), rgb('#3b1f2b')),
  cherryPlanks: planks(pal('#e6b3a8', '#dba69b', '#f0c1b6', '#e0ab9f'), rgb('#b07c74')),
  cherryLeaves: leaves(pal('#f4b0cc', '#f8c4da', '#eb9cbf', '#fcd8e6'), 0.1),
  water,
  glass,
  bookshelf,
  woolWhite: wool('#e9ecec'),
  woolRed: wool('#a12722'),
  woolBurgundy: wool('#7a1730'),
  woolBlue: wool('#6aa6f2'),
  woolNavy: wool('#2d3a8c'),
  woolPink: wool('#f3a3c6'),
  woolYellow: wool('#f5c63d'),
  woolCream: wool('#f4ecdc'),
  glowstone,
  bricks: bricks(pal('#a65a48', '#9a5040', '#b26553'), rgb('#c9bfb0')),
  stoneBricks: bricks(pal('#8a8a8a', '#7f7f7f', '#959595'), rgb('#5a5a5a')),
  hay: haySide,
  hayTop,
  rose: rose(pal('#8f1f3a', '#a3203a', '#c03550', '#7a1730'), rgb('#4a0f1a')),
  poppy: rose(pal('#d4332b', '#e04a35', '#bd2a24'), rgb('#3a1410')),
  cornflower,
  daisy,
  dandelion,
  allium,
  pinkTulip: tulip(pal('#f39ac0', '#e57fab', '#ffb7d2')),
  tuft,
  wheat,
  farmland,
} as const;

export type TileName = keyof typeof PAINTERS;

const NAMES = Object.keys(PAINTERS) as TileName[];
/** Tiles per row of the atlas, and pixels per tile in it (each painted pixel drawn 2×2). */
const PER_ROW = 8;
const CELL = 32;

export interface Atlas {
  texture: THREE.Texture;
  /** The corners of a tile in the atlas: [u0, v0, u1, v1]. */
  uv(tile: TileName): readonly [number, number, number, number];
  /** The tile's pixels, for drawing it elsewhere (as an icon, a particle…). */
  pixels(tile: TileName): Tile;
}

let atlasCache: Atlas | null = null;

/** Every tile, painted once and laid out in a texture with crisp, unblurred pixels. */
export function atlas(): Atlas {
  if (atlasCache) return atlasCache;
  const rows = Math.ceil(NAMES.length / PER_ROW);
  const width = PER_ROW * CELL;
  const height = rows * CELL;
  // Raw pixels rather than a canvas: a canvas forgets the colour of a clear
  // pixel, and the holes in leaves need theirs, to close over at a distance.
  const data = new Uint8Array(width * height * 4);
  const tiles = new Map<TileName, Tile>();
  const scale = CELL / S;
  NAMES.forEach((name, index) => {
    const tile = new Tile();
    PAINTERS[name](tile, mulberry(1000 + index * 7919));
    tiles.set(name, tile);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < S * S; i++) {
      if (!tile.data[i * 4 + 3]) continue;
      r += tile.data[i * 4];
      g += tile.data[i * 4 + 1];
      b += tile.data[i * 4 + 2];
      n++;
    }
    const fill = n ? [r / n, g / n, b / n, 0] : [0, 0, 0, 0];
    const ox = (index % PER_ROW) * CELL;
    const oy = Math.floor(index / PER_ROW) * CELL;
    for (let y = 0; y < CELL; y++) {
      // The top row of the picture goes at the top of the texture.
      const row = height - 1 - (oy + y);
      for (let x = 0; x < CELL; x++) {
        const src = (Math.floor(y / scale) * S + Math.floor(x / scale)) * 4;
        const dst = (row * width + ox + x) * 4;
        if (tile.data[src + 3]) data.set(tile.data.subarray(src, src + 4), dst);
        else data.set(fill, dst);
      }
    }
  });
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const inset = 0.5 / Math.max(width, height);
  atlasCache = {
    texture,
    uv(tile) {
      const index = NAMES.indexOf(tile);
      const col = index % PER_ROW;
      const row = Math.floor(index / PER_ROW);
      return [
        (col * CELL) / width + inset,
        1 - ((row + 1) * CELL) / height + inset,
        ((col + 1) * CELL) / width - inset,
        1 - (row * CELL) / height - inset,
      ];
    },
    pixels: (tile) => tiles.get(tile)!,
  };
  return atlasCache;
}

// ---------------------------------------------------------------------------
// Blocks.
// ---------------------------------------------------------------------------

/** How a block is drawn: a solid cube, a cube you can see through, crossed planes, or water. */
export type BlockKind = 'solid' | 'cutout' | 'cross' | 'liquid';

export interface BlockDef {
  kind: BlockKind;
  top: TileName;
  side: TileName;
  bottom: TileName;
  /** Light it gives off, 0 to 15. */
  light?: number;
}

const cube = (top: TileName, side = top, bottom = top, kind: BlockKind = 'solid'): BlockDef => ({
  kind,
  top,
  side,
  bottom,
});
const plant = (tile: TileName): BlockDef => ({
  kind: 'cross',
  top: tile,
  side: tile,
  bottom: tile,
});

/** The blocks, by number. 0 is air. */
export const B = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Cobble: 4,
  Sand: 5,
  Snow: 6,
  SnowyGrass: 7,
  Gravel: 8,
  Path: 9,
  OakLog: 10,
  OakPlanks: 11,
  OakLeaves: 12,
  SpruceLog: 13,
  SprucePlanks: 14,
  SpruceLeaves: 15,
  CherryLog: 16,
  CherryPlanks: 17,
  CherryLeaves: 18,
  Water: 19,
  Glass: 20,
  Bookshelf: 21,
  WoolWhite: 22,
  WoolRed: 23,
  WoolBurgundy: 24,
  WoolBlue: 25,
  WoolNavy: 26,
  WoolPink: 27,
  WoolYellow: 28,
  WoolCream: 29,
  Glowstone: 30,
  Bricks: 31,
  StoneBricks: 32,
  Hay: 33,
  Rose: 34,
  Poppy: 35,
  Cornflower: 36,
  Daisy: 37,
  Dandelion: 38,
  Allium: 39,
  PinkTulip: 40,
  Tuft: 41,
  Wheat: 42,
  Farmland: 43,
} as const;

export type BlockId = (typeof B)[keyof typeof B];

export const BLOCKS: readonly (BlockDef | null)[] = [
  null,
  cube('grassTop', 'grassSide', 'dirt'),
  cube('dirt'),
  cube('stone'),
  cube('cobble'),
  cube('sand'),
  cube('snow'),
  cube('snow', 'snowSide', 'dirt'),
  cube('gravel'),
  cube('path', 'dirt', 'dirt'),
  cube('oakLogTop', 'oakLog', 'oakLogTop'),
  cube('oakPlanks'),
  cube('oakLeaves', 'oakLeaves', 'oakLeaves', 'cutout'),
  cube('spruceLogTop', 'spruceLog', 'spruceLogTop'),
  cube('sprucePlanks'),
  cube('spruceLeaves', 'spruceLeaves', 'spruceLeaves', 'cutout'),
  cube('cherryLogTop', 'cherryLog', 'cherryLogTop'),
  cube('cherryPlanks'),
  cube('cherryLeaves', 'cherryLeaves', 'cherryLeaves', 'cutout'),
  cube('water', 'water', 'water', 'liquid'),
  cube('glass', 'glass', 'glass', 'cutout'),
  cube('oakPlanks', 'bookshelf', 'oakPlanks'),
  cube('woolWhite'),
  cube('woolRed'),
  cube('woolBurgundy'),
  cube('woolBlue'),
  cube('woolNavy'),
  cube('woolPink'),
  cube('woolYellow'),
  cube('woolCream'),
  { ...cube('glowstone'), light: 15 },
  cube('bricks'),
  cube('stoneBricks'),
  cube('hayTop', 'hay', 'hayTop'),
  plant('rose'),
  plant('poppy'),
  plant('cornflower'),
  plant('daisy'),
  plant('dandelion'),
  plant('allium'),
  plant('pinkTulip'),
  plant('tuft'),
  plant('wheat'),
  cube('farmland', 'dirt', 'dirt'),
];
