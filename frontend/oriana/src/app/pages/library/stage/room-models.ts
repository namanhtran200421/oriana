import { Micro, Paint } from '../../../voxel/micro';
import { mulberry } from '../../../voxel/noise';

/**
 * The things in the reading room too small or too fine to be blocks: the desk
 * and what is on it, her book, the window's casements, the fire, the cat.
 */

/** A writing desk of dark wood: a thick top, four legs, a drawer with a brass knob. 40 × 10 × 18. */
export function desk(): Micro {
  const m = new Micro();
  const top = '#6b4a2b';
  const edge = '#7d5a35';
  const leg = '#523720';
  m.box(-20, 8, -9, 19, 9, 8, top);
  for (let x = -20; x <= 19; x++) m.put(x, 9, 8, edge).put(x, 9, -9, edge);
  for (const [x, z] of [
    [-19, -8],
    [16, -8],
    [-19, 5],
    [16, 5],
  ]) {
    m.box(x, 0, z, x + 2, 7, z + 2, leg);
  }
  // A drawer under the top, toward her.
  m.box(-15, 5, 6, -2, 7, 7, '#5e4127');
  m.box(-15, 5, 8, -2, 5, 8, '#4a321d');
  m.put(-9, 6, 8, '#e2b33c').put(-8, 6, 8, '#e2b33c');
  // A green blotter on the top, as old desks had.
  m.box(-12, 10, -8, 9, 10, 7, '#2f5b3a');
  for (let x = -12; x <= 9; x++) m.put(x, 10, 7, '#3a6b45').put(x, 10, -8, '#244a2e');
  return m;
}

/** A squat ink bottle with a white quill in it. 16ths of a block. */
export function inkwell(): Micro {
  const m = new Micro();
  m.box(-3, 0, -3, 3, 4, 3, '#1d2230');
  m.box(-2, 5, -2, 2, 5, 2, '#262c3d');
  m.box(-1, 6, -1, 1, 6, 1, '#8a6a3f');
  m.put(-2, 3, 3, '#5a6a90').put(-2, 2, 3, '#3e4a68');
  // The quill, leaning back, its vane widening up the shaft.
  for (let k = 0; k < 14; k++) {
    const x = Math.round(k * 0.45);
    const y = 6 + k;
    const z = -Math.round(k * 0.3);
    m.put(x, y, z, k < 2 ? '#2a2a2a' : '#e8e2d4');
    if (k > 3) {
      const width = Math.min(2, Math.floor((k - 3) / 3) + 1);
      for (let w = 1; w <= width; w++)
        m.put(x - w, y, z, '#fbf8f0').put(x + w, y - 1, z, '#f0ead8');
    }
  }
  return m;
}

/** Three old books stacked. 16ths. */
export function bookPile(): Micro {
  const m = new Micro();
  const rand = mulberry(9);
  const covers = ['#3d5a8c', '#8b2635', '#3d7a3a'];
  let y = 0;
  for (let b = 0; b < 3; b++) {
    const w = 12 + Math.floor(rand() * 3);
    const d = 8 + Math.floor(rand() * 2);
    const ox = -Math.floor(w / 2) + Math.floor((rand() - 0.5) * 3);
    const oz = -Math.floor(d / 2) + Math.floor((rand() - 0.5) * 2);
    m.box(ox, y, oz, ox + w - 1, y + 2, oz + d - 1, covers[b]);
    // Pages showing on three sides.
    m.box(ox + 1, y + 1, oz, ox + w - 1, y + 1, oz + d - 2, '#efe4c8');
    m.box(ox + 1, y + 1, oz + d - 1, ox + w - 1, y + 1, oz + d - 1, covers[b]);
    m.put(ox + 2, y + 2, oz + d - 1, '#e2b33c').put(ox + w - 3, y + 2, oz + d - 1, '#e2b33c');
    y += 3;
  }
  return m;
}

/**
 * Her book: thick, bound in crimson with gold at the corners and bands on the
 * spine, a gold heart on the front. Standing upright, spine toward +z; 12ths.
 */
export function herBook(leather = '#8b1e2e'): Micro {
  const m = new Micro();
  const dark = '#6a1421';
  const gold: Paint = ['#e8b84a', 0.35];
  const pages = '#f4ead2';
  // Pages, inside.
  m.box(-3, 1, -7, 3, 18, 6, pages);
  for (let y = 2; y <= 17; y += 2) m.put(-3, y, -7, '#e0d4b8').put(1, y, -7, '#e0d4b8');
  // Covers and spine.
  m.box(-4, 0, -7, -4, 19, 7, leather).box(4, 0, -7, 4, 19, 7, leather);
  m.box(-4, 0, 7, 4, 19, 7, leather);
  for (let y = 0; y <= 19; y++) m.put(-4, y, -7, dark).put(4, y, -7, dark);
  // Gold bands at the spine's head and foot (the title goes between).
  for (const y of [2, 3, 16, 17]) for (let x = -4; x <= 4; x++) m.put(x, y, 7, gold);
  // Gold corners on the covers.
  for (const x of [-5, 5]) {
    for (const [y, z] of [
      [0, -7],
      [1, -7],
      [0, -6],
      [19, -7],
      [18, -7],
      [19, -6],
      [0, 7],
      [19, 7],
    ]) {
      m.put(x, y, z, gold);
    }
  }
  // A big gold heart on the front cover (+x).
  const heart = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  heart.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === 'X') m.put(5, 13 - r, c - 3, gold);
    });
  });
  return m;
}

/** A ribbon marker, hanging from the top of a book being read. */
export function ribbon(): Micro {
  const m = new Micro();
  for (let k = 0; k < 7; k++) m.put(0, -k, Math.floor(k / 3), '#c0303e');
  m.put(0, -7, 2, '#a02030');
  return m;
}

/** One casement of the tall window: a wooden frame with a cross of glazing bars. 16ths. */
export function casementFrame(): Micro {
  const m = new Micro();
  const wood = '#5a3d22';
  const light = '#6e4b2a';
  m.box(0, 0, 0, 15, 1, 1, wood).box(0, 62, 0, 15, 63, 1, wood);
  m.box(0, 0, 0, 1, 63, 1, wood).box(14, 0, 0, 15, 63, 1, wood);
  m.box(7, 0, 0, 8, 63, 0, light).box(0, 31, 0, 15, 32, 0, light);
  m.box(0, 15, 0, 15, 15, 0, light).box(0, 47, 0, 15, 47, 0, light);
  m.put(13, 30, 2, '#e2b33c').put(13, 31, 2, '#e2b33c');
  return m;
}

/** The glass in a casement, drawn separately to be seen through. */
export function casementGlass(): Micro {
  const m = new Micro();
  m.box(2, 2, 0, 13, 61, 0, '#cfe8f7');
  for (const [x, y] of [
    [4, 56],
    [5, 55],
    [6, 54],
    [4, 24],
    [5, 23],
  ]) {
    m.put(x, y, 0, '#ffffff');
  }
  return m;
}

/** Flames, three tongues of them; drawn glowing. 16ths. */
export function flames(): Micro {
  const m = new Micro();
  const tongue = (x: number, z: number, tall: number) => {
    for (let y = 0; y < tall; y++) {
      const w = Math.max(0, Math.round((1 - y / tall) * 2.4));
      const colour = y < tall * 0.35 ? '#ffe08a' : y < tall * 0.7 ? '#ffb347' : '#ff7a2a';
      for (let dx = -w; dx <= w; dx++) {
        for (let dz = -w; dz <= w; dz++) {
          if (Math.abs(dx) + Math.abs(dz) <= w + 1) m.put(x + dx, y, z + dz, [colour, 1]);
        }
      }
    }
  };
  tongue(0, 0, 13);
  tongue(-4, 1, 9);
  tongue(4, -1, 10);
  return m;
}

/** Two logs crossed in the grate. 16ths. */
export function logs(): Micro {
  const m = new Micro();
  m.box(-8, 0, -2, 8, 2, 0, '#5f472c')
    .box(-8, 0, -2, -8, 2, 0, '#b8945f')
    .box(8, 0, -2, 8, 2, 0, '#b8945f');
  m.box(-2, 1, -7, 0, 3, 6, '#6b5134').box(-2, 1, 6, 0, 3, 6, '#b8945f');
  for (const [x, z] of [
    [-4, -1],
    [3, -2],
    [-1, 3],
  ]) {
    m.put(x, 3, z, ['#ff7a2a', 1]);
  }
  return m;
}

/** A cream cat curled up asleep, ginger ears and tail tip. 16ths. */
export function sleepingCat(): Micro {
  const m = new Micro();
  const cream = '#f4e6cf';
  const shade = '#e3cfae';
  const ginger = '#e8a25a';
  m.box(-5, 0, -4, 5, 4, 4, cream);
  m.box(-5, 0, -4, 5, 0, 4, shade);
  m.box(-4, 5, -3, 4, 5, 3, cream);
  // Head, resting on the paws, toward +x.
  m.box(4, 0, -3, 9, 5, 3, cream);
  m.box(9, 1, -1, 10, 2, 1, '#f9efe0');
  m.put(10, 2, 0, '#e89aa0');
  m.box(7, 3, -2, 7, 3, -2, '#3a2a22').box(7, 3, 2, 7, 3, 2, '#3a2a22');
  m.box(5, 6, -3, 6, 7, -2, ginger).box(5, 6, 2, 6, 7, 3, ginger);
  // Paws tucked in, tail round the front.
  m.box(6, 0, -4, 9, 1, -3, '#fbf3e6');
  for (let k = 0; k < 9; k++) m.put(-5 + k, 0, 5, k > 6 ? ginger : cream);
  return m;
}

/** A plain old book, standing, spine toward +z. 16ths. */
export function plainBook(cover: string, tall = 14, thick = 4): Micro {
  const m = new Micro();
  const half = Math.floor(thick / 2);
  m.box(-half, 0, -5, thick - half - 1, tall - 1, 4, cover);
  m.box(-half + 1, 1, -5, thick - half - 2, tall - 2, 3, '#efe4c8');
  m.box(-half, 2, 4, thick - half - 1, 2, 4, '#d9b45a');
  m.box(-half, tall - 3, 4, thick - half - 1, tall - 3, 4, '#d9b45a');
  return m;
}
