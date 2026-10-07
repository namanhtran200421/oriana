import { Micro, Paint } from './micro';

/**
 * The little models the worlds share, built cell by cell. Each comes back
 * as a `Micro`, to be turned into geometry at whatever size it is wanted.
 */

const GOLD: Paint = ['#ffb22e', 1];
const GOLD_LIGHT: Paint = ['#ffe27a', 1];

export interface FlowerColours {
  deep: string;
  mid: string;
  light: string;
  tip: string;
}

export const ROSE_COLOURS: FlowerColours = {
  deep: '#55102a',
  mid: '#7f1a35',
  light: '#a52b45',
  tip: '#c9475d',
};
export const CORNFLOWER_COLOURS: FlowerColours = {
  deep: '#2a56a6',
  mid: '#4583dc',
  light: '#6aa6f2',
  tip: '#9ccbfb',
};

/**
 * A flower's head, facing +z: round petals (five, or eight ragged ones) about
 * a golden heart that glows. Seventeen cells across.
 */
export function flowerHead(colours: FlowerColours, petals: 5 | 8): Micro {
  const m = new Micro();
  for (let y = -8; y <= 8; y++) {
    for (let x = -8; x <= 8; x++) {
      const r = Math.hypot(x, y);
      const theta = Math.atan2(y, x) + Math.PI / 2;
      const lobe = 0.5 + 0.5 * Math.cos(petals * theta);
      const edge = petals === 5 ? 4.6 + 3.4 * Math.pow(lobe, 0.7) : 4.2 + 3.8 * Math.pow(lobe, 1.6);
      if (r > edge) continue;
      if (r < 1.6) {
        m.put(x, y, 0, r < 0.8 ? GOLD_LIGHT : GOLD)
          .put(x, y, 1, GOLD)
          .put(x, y, 2, r < 0.8 ? GOLD_LIGHT : GOLD);
        continue;
      }
      if (r < 2.5) {
        m.put(x, y, 0, '#e0a43a').put(x, y, 1, '#e0a43a');
        continue;
      }
      const t = r / edge;
      const paint =
        t < 0.5 ? colours.deep : t < 0.72 ? colours.mid : t < 0.9 ? colours.light : colours.tip;
      // Petals cup forward a little toward their tips.
      m.put(x, y, t > 0.8 ? 1 : 0, paint);
      if (t <= 0.8) m.put(x, y, 1, paint);
    }
  }
  // Green behind, holding it.
  m.blob(0, 0, -1, 3.2, 3.2, 0.6, '#3f7f2a');
  return m;
}

/** A tall stem with two leaves, `tall` cells high, two cells thick. */
export function stem(tall: number): Micro {
  const m = new Micro();
  m.box(0, 0, 0, 1, tall - 1, 1, '#4d9a2f');
  for (let y = 0; y < tall; y += 3) m.put(0, y, 1, '#3f7f2a');
  // A leaf each side, rising outward.
  const leaf = (dir: 1 | -1, at: number, length: number) => {
    for (let k = 1; k <= length; k++) {
      const x = dir === 1 ? 1 + k : -k;
      const y = at + Math.floor(k / 2);
      m.put(x, y, 0, '#5aaa38').put(x, y, 1, '#4d9a2f');
      if (k > 1 && k < length) m.put(x, y + 1, 0, '#6ab544').put(x, y + 1, 1, '#5aaa38');
    }
  };
  leaf(1, Math.floor(tall * 0.25), 5);
  leaf(-1, Math.floor(tall * 0.5), 4);
  return m;
}

/** A four-pointed sparkle, glowing: something here not yet found. */
export function sparkle(): Micro {
  return new Micro().picture(
    ['...X...', '...X...', '..XWX..', 'XXWWWXX', '..XWX..', '...X...', '...X...'],
    { X: GOLD, W: GOLD_LIGHT },
    -3,
    0,
  );
}

/** A little heart: something here already found, and loved. */
export function heart(colour = '#ff5c8a', light = '#ffb3c8'): Micro {
  return new Micro().picture(
    ['.XX.XX.', 'XWXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    { X: [colour, 1], W: [light, 1] },
    -3,
    0,
    0,
    2,
  );
}

/** A round, fuzzy bee, facing +z. Its wings come separately, to flap. */
export function bee(): { body: Micro; wing: Micro } {
  const body = new Micro();
  const yellow = '#f2c43a';
  const dark = '#3a2a1c';
  for (let z = -4; z <= 4; z++) {
    const stripe = z === -1 || z === 2;
    body.box(-3, 0, z, 3, 5, z, stripe ? dark : yellow);
  }
  // Rounded off at the edges.
  for (const [x, y] of [
    [-3, 0],
    [3, 0],
    [-3, 5],
    [3, 5],
  ]) {
    body.clear(x, y, -4).clear(x, y, 4);
  }
  // Big eyes, a face, a sting, and two feelers.
  body.box(-3, 2, 4, -2, 4, 4, dark).box(2, 2, 4, 3, 4, 4, dark);
  body.put(-2, 4, 4, '#ffffff').put(3, 4, 4, '#ffffff');
  body.box(-1, 1, 5, 1, 3, 5, '#e3b02e');
  body.put(0, 2, -5, '#8a8a8a');
  body.put(-1, 6, 4, dark).put(-1, 7, 5, dark).put(1, 6, 4, dark).put(1, 7, 5, dark);
  const wing = new Micro().box(0, 0, 0, 3, 0, 2, '#e8f4ff').put(3, 0, 2, '#cfe6fa');
  return { body, wing };
}

/**
 * A wishing star, five-pointed and plump (thicker in the middle), with a
 * sleepy little face. Fifteen cells across, facing +z.
 */
export function wishingStar(body = '#ffc94a', light = '#fff0a8', edge = '#f0a020'): Micro {
  const m = new Micro();
  const points: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? 3.2 : 7.6;
    points.push([Math.cos(a) * r, Math.sin(a) * r - 0.6]);
  }
  const inside = (x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  for (let y = -8; y <= 8; y++) {
    for (let x = -8; x <= 8; x++) {
      if (!inside(x, y)) continue;
      const rim = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
      const r = Math.hypot(x, y + 0.6);
      const paint: Paint = [rim ? edge : r < 2.5 ? light : body, 1];
      const depth = r < 2.5 ? 2 : r < 4.5 ? 1 : 0;
      for (let z = -depth; z <= depth; z++) m.put(x, y, z, paint);
    }
  }
  // Two round eyes, a small smile and a blush, on the front.
  const front = 3;
  const ink = '#6b3a12';
  m.box(-2, 0, front, -2, 1, front, ink).box(2, 0, front, 2, 1, front, ink);
  m.put(-1, -1, front - 1, ink)
    .put(0, -2, front - 1, ink)
    .put(1, -1, front - 1, ink);
  m.put(-3, -1, front - 1, ['#ff8fa8', 1]).put(3, -1, front - 1, ['#ff8fa8', 1]);
  return m;
}

/** A lantern: an iron cage round a warm glow, a ring on top. Six cells across. */
export function lantern(): Micro {
  const iron = '#3b3a40';
  const m = new Micro();
  m.box(0, 0, 0, 5, 0, 5, iron).box(0, 7, 0, 5, 7, 5, iron);
  for (const [x, z] of [
    [0, 0],
    [5, 0],
    [0, 5],
    [5, 5],
  ]) {
    m.box(x, 1, z, x, 6, z, iron);
  }
  m.box(1, 1, 1, 4, 6, 4, ['#ffb347', 1]).box(2, 2, 2, 3, 5, 3, ['#ffe08a', 1]);
  m.box(2, 8, 2, 3, 8, 3, iron).put(2, 9, 2, iron).put(3, 9, 3, iron);
  return m;
}

/** A wooden post with a cross-bar, for a lantern to hang from. */
export function post(tall: number): Micro {
  const m = new Micro();
  m.box(0, 0, 0, 1, tall - 1, 1, '#8a6a3f');
  for (let y = 0; y < tall; y += 4) m.put(0, y, 0, '#7a5a33');
  m.box(-3, tall - 2, 0, 1, tall - 1, 1, '#9b7a4a');
  return m;
}

/**
 * A hot-air balloon of wool: a round envelope in stripes of two colours, a
 * glowing burner, ropes, and a little wicker basket. Thirteen cells across.
 */
export function balloon(a: string, b: string, trim = '#f4ecdc'): Micro {
  const m = new Micro();
  const middle = 13;
  for (let y = 4; y <= 21; y++) {
    // Round on top, narrowing below to the mouth.
    const t = y - middle;
    const r =
      t >= 0 ? 6.4 * Math.sqrt(Math.max(0, 1 - (t / 8.6) ** 2)) : 6.4 - (-t / 9) ** 1.6 * 4.6;
    for (let z = -7; z <= 7; z++) {
      for (let x = -7; x <= 7; x++) {
        if (Math.hypot(x, z) > r) continue;
        const gore = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 10) % 2;
        const band = y === middle - 3;
        m.put(x, y, z, band ? trim : gore ? a : b);
      }
    }
  }
  // The burner's glow at the mouth, the ropes, and the basket.
  m.box(-1, 3, -1, 1, 3, 1, ['#ffb347', 1]).put(0, 4, 0, ['#ffe08a', 1]);
  for (const [x, z] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ]) {
    m.put(x, 2, z, '#5a4630').put(x, 1, z, '#5a4630');
  }
  m.box(-2, -2, -2, 2, 0, 2, '#9b7440');
  m.box(-2, 0, -2, 2, 0, 2, '#7d5a30');
  m.box(-1, 0, -1, 1, 0, 1, '#5a3f22');
  return m;
}

/** A brown Swiss cow with a white face and a bell, facing +z. */
export function cow(): Micro {
  const m = new Micro();
  const brown = '#8a5a3a';
  const dark = '#6e452b';
  const white = '#efe9df';
  // Body.
  m.box(-4, 6, -8, 4, 13, 7, brown);
  m.box(-4, 9, -3, 4, 13, 1, dark);
  m.box(-4, 6, 2, -2, 9, 5, white);
  // Legs.
  for (const [x, z] of [
    [-4, -8],
    [2, -8],
    [-4, 4],
    [2, 4],
  ]) {
    m.box(x, 0, z, x + 2, 5, z + 3, brown);
    m.box(x, 0, z, x + 2, 0, z + 3, '#3a2a1c');
  }
  // Head, with a pale muzzle, eyes, ears, horns.
  m.box(-3, 9, 8, 3, 15, 12, white);
  m.box(-3, 13, 8, 3, 15, 12, brown);
  m.box(-2, 9, 12, 2, 11, 13, '#e8b0a0');
  m.put(-1, 10, 13, '#7a4a40').put(1, 10, 13, '#7a4a40');
  m.put(-2, 12, 12, '#1e1a18').put(2, 12, 12, '#1e1a18');
  m.box(-5, 13, 9, -4, 13, 10, dark).box(4, 13, 9, 5, 13, 10, dark);
  m.box(-4, 16, 10, -3, 16, 10, '#f2e6c8').put(-4, 17, 10, '#f2e6c8');
  m.box(3, 16, 10, 4, 16, 10, '#f2e6c8').put(4, 17, 10, '#f2e6c8');
  // A golden bell under the chin, on a red strap.
  m.box(-3, 8, 9, 3, 8, 9, '#b8322c');
  m.box(-1, 5, 9, 1, 7, 10, '#e2b33c').put(0, 4, 9, '#b8862a');
  // A tail.
  m.box(0, 9, -9, 0, 13, -9, brown).put(0, 8, -9, '#3a2a1c');
  return m;
}

/** A swing: a plank seat on two ropes, hanging from its top (y = 0) down `drop` cells. */
export function swing(drop: number): Micro {
  const m = new Micro();
  for (let y = 0; y > -drop; y--) m.put(-5, y, 0, '#d9c49a').put(5, y, 0, '#d9c49a');
  m.box(-6, -drop - 1, -2, 6, -drop, 2, '#a07a48');
  m.box(-6, -drop, -2, 6, -drop, -2, '#b8945f');
  // A ribbon tied on one rope.
  m.put(-6, -drop + 6, 0, '#d6416b')
    .put(-6, -drop + 5, 0, '#d6416b')
    .put(-7, -drop + 5, 0, '#ff8fb0');
  return m;
}

/** A wicker picnic basket with its lid half open, a bottle peeking out. */
export function basket(): Micro {
  const m = new Micro();
  for (let y = 0; y < 5; y++) {
    for (let x = -4; x <= 4; x++) {
      for (let z = -3; z <= 3; z++) {
        const edge = Math.abs(x) === 4 || Math.abs(z) === 3 || y === 0;
        if (edge) m.put(x, y, z, (x + y + z) % 2 ? '#b8894a' : '#a0743a');
      }
    }
  }
  m.box(-3, 1, -2, 3, 4, 2, '#f4ecdc');
  m.box(-4, 5, -3, 4, 5, 0, '#8a6232');
  m.box(-1, 5, 1, -1, 8, 1, '#3d7a3a').put(-1, 9, 1, '#c9a234');
  m.box(-3, 6, -1, 3, 6, -1, '#7a5228')
    .put(-3, 7, -1, '#7a5228')
    .put(3, 7, -1, '#7a5228')
    .box(-2, 8, -1, 2, 8, -1, '#7a5228');
  return m;
}

/** A butterfly, wings spread (they come separately, to beat). */
export function butterfly(colour: string, spots: string): { body: Micro; wing: Micro } {
  const body = new Micro()
    .box(0, 0, -2, 0, 0, 2, '#2a1a1a')
    .put(-1, 1, 3, '#2a1a1a')
    .put(1, 1, 3, '#2a1a1a');
  const wing = new Micro();
  for (const [x, z] of [
    [1, -2],
    [2, -2],
    [1, -1],
    [2, -1],
    [3, -1],
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [2, 3],
    [3, 3],
  ]) {
    wing.put(x - 1, 0, z, x === 3 && z === 2 ? spots : colour);
  }
  return { body, wing };
}

/** A fluffy sheep, facing +z: a great cloud of wool on four thin legs, a dark face. */
export function sheep(fleece = '#efeae0'): Micro {
  const m = new Micro();
  m.box(-5, 6, -8, 5, 15, 7, fleece);
  for (const [x, z] of [
    [-5, -8],
    [5, -8],
    [-5, 7],
    [5, 7],
    [-5, 7],
  ]) {
    m.clear(x, 15, z).clear(x, 6, z);
  }
  for (let k = 0; k < 18; k++) m.put(-5 + ((k * 7) % 11), 15, -7 + ((k * 5) % 14), '#f8f4ec');
  for (const [x, z] of [
    [-4, -7],
    [2, -7],
    [-4, 4],
    [2, 4],
  ]) {
    m.box(x, 0, z, x + 2, 5, z + 2, '#d8c8b0');
    m.box(x, 0, z, x + 2, 0, z + 2, '#5a4a3a');
  }
  m.box(-3, 9, 8, 3, 15, 13, '#d8c8b0');
  m.box(-4, 13, 8, 4, 16, 10, fleece);
  m.put(-2, 12, 14, '#1e1a18').put(2, 12, 14, '#1e1a18');
  m.box(-1, 10, 14, 1, 10, 14, '#e8a0a0');
  m.box(-5, 12, 10, -4, 12, 11, '#d8c8b0').box(4, 12, 10, 5, 12, 11, '#d8c8b0');
  return m;
}

/** A small rowing boat, pulled up on the sand, an oar inside. */
export function rowboat(): Micro {
  const m = new Micro();
  for (let z = -10; z <= 10; z++) {
    const half = Math.round(4.5 * Math.sqrt(1 - (z / 11) ** 2));
    for (let x = -half; x <= half; x++) {
      const hull = Math.abs(x) === half || z === -10 || z === 10;
      m.put(x, 0, z, '#7a5228');
      if (hull) m.put(x, 1, z, '#a0743a').put(x, 2, z, '#f4ecdc');
    }
  }
  m.box(-half(0), 2, -1, half(0), 2, 0, '#8a6232');
  for (let k = -8; k <= 8; k++) m.put(1, 1, k, '#c9a87a');
  m.box(0, 1, 7, 2, 1, 9, '#c9a87a');
  return m;

  function half(z: number) {
    return Math.round(4.5 * Math.sqrt(1 - (z / 11) ** 2));
  }
}

/** A gull, wings spread, white with grey backs and black tips. Wings separate. */
export function gull(back = '#c8ccd2'): { body: Micro; wing: Micro } {
  const body = new Micro()
    .box(-1, 0, -4, 1, 1, 3, '#f6f6f2')
    .put(0, 1, 4, '#f6f6f2')
    .put(0, 1, 5, '#f2b02e');
  body.box(-1, 0, -6, 1, 0, -5, '#f6f6f2');
  const wing = new Micro();
  for (let x = 0; x < 9; x++) {
    const depth = x < 6 ? 2 : 1;
    for (let z = -depth; z <= 0; z++) wing.put(x, 0, z, x > 6 ? '#2a2a2a' : back);
  }
  return { body, wing };
}

/** A fence round a list of corners (in cells of the model): posts and two rails between. */
export function fence(points: readonly [number, number][], scale: number): Micro {
  const m = new Micro();
  const wood = '#8a6a3f';
  const rail = '#9b7a4a';
  const spacing = Math.round(1 / scale);
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(ax + ((bx - ax) * s) / steps);
      const z = Math.round(az + ((bz - az) * s) / steps);
      m.put(x, Math.round(spacing * 0.35), z, rail).put(x, Math.round(spacing * 0.7), z, rail);
      if (s % spacing === 0) m.box(x, 0, z, x + 1, spacing - 1, z + 1, wood);
    }
  }
  return m;
}
