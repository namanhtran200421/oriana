import { seeded } from '../shelf';

/**
 * The hall behind the library, in a 1600 × 1000 drawing scaled to cover the
 * window: two towering bookcases either side of a lancet window, a rolling
 * ladder, and the night through the glass. Built once, deterministically, and
 * merged into a handful of paths so the browser rasterises it a single time.
 */
export interface Hall {
  /** Uprights, shelves and cornices. */
  wood: string;
  /** Books, one path per leather. */
  books: { color: string; d: string }[];
  /** Gilt bands that wake under the lantern. */
  gilt: string;
  ladder: string;
  stars: { x: number; y: number; r: number; delay: number }[];
}

/** The window: a pointed arch whose two arcs share one radius. */
export const WINDOW = {
  outer: 'M610 860 L610 360 A300 300 0 0 1 800 81 A300 300 0 0 1 990 360 L990 860 Z',
  glass: 'M624 846 L624 360 A286 286 0 0 1 800 96 A286 286 0 0 1 976 360 L976 846 Z',
  // Mullions and a transom, the three lights' heads, and a rose above them.
  tracery:
    'M736 846 V372 M864 846 V372 M624 610 H976 ' +
    'M624 372 A118 118 0 0 1 680 292 A118 118 0 0 1 736 372 ' +
    'M736 372 A118 118 0 0 1 800 292 A118 118 0 0 1 864 372 ' +
    'M864 372 A118 118 0 0 1 920 292 A118 118 0 0 1 976 372',
  rose: { cx: 800, cy: 200, r: 56 },
  moon: { cx: 892, cy: 236, r: 30 },
  sill: 'M590 860 H1010 V884 H590 Z',
} as const;

/** Light falling from each of the three lights, down and to the right. */
export const BEAMS = [
  'M626 420 L734 420 L1010 1000 L840 1000 Z',
  'M738 420 L862 420 L1180 1000 L990 1000 Z',
  'M866 420 L974 420 L1330 1000 L1150 1000 Z',
];

const LEATHERS = [
  '#2c1517',
  '#2f1e14',
  '#16211b',
  '#151b27',
  '#201914',
  '#3b2c16',
  '#281f2e',
  '#20291b',
  '#3b1919',
  '#1b2325',
  '#31251b',
];

const CASES = [
  { left: 0, right: 586, bays: [0, 196, 392, 586] },
  { left: 1014, right: 1600, bays: [1014, 1210, 1406, 1600] },
];
const TOP = 46;
const SHELF_STEP = 132;
const BOARD = 11;
const POST = 13;

export function buildHall(): Hall {
  const rand = seeded(20260504);
  const wood: string[] = [];
  const byColor = LEATHERS.map(() => [] as string[]);
  const gilt: string[] = [];
  const rect = (x: number, y: number, w: number, h: number) =>
    `M${r(x)} ${r(y)}h${r(w)}v${r(h)}h${r(-w)}Z`;

  for (const bookcase of CASES) {
    wood.push(rect(bookcase.left - 10, TOP - 30, bookcase.right - bookcase.left + 20, 34));
    for (const x of bookcase.bays) wood.push(rect(x - POST / 2, TOP, POST, 1000 - TOP));

    for (let shelf = TOP + SHELF_STEP; shelf < 1000 + SHELF_STEP; shelf += SHELF_STEP) {
      wood.push(rect(bookcase.left, shelf - BOARD, bookcase.right - bookcase.left, BOARD));
      const floor = shelf - BOARD;

      for (let b = 0; b < bookcase.bays.length - 1; b++) {
        let x = bookcase.bays[b] + POST / 2 + 3;
        const end = bookcase.bays[b + 1] - POST / 2 - 3;
        while (x < end - 8) {
          if (rand() < 0.07) {
            x += 14 + rand() * 40;
            continue;
          }
          const w = Math.min(9 + rand() * 13, end - x);
          const h = 72 + rand() * 42;
          byColor[Math.floor(rand() * LEATHERS.length)].push(rect(x, floor - h, w - 0.8, h));
          if (rand() < 0.45) {
            gilt.push(rect(x + 0.5, floor - h + 8, w - 1.8, 2.4));
            gilt.push(rect(x + 0.5, floor - 14, w - 1.8, 2.4));
          }
          x += w;
        }
      }
    }
  }

  // A rolling ladder against the right-hand case.
  const ladder: string[] = [];
  const rails = [
    [1092, 1000, 1176, 70],
    [1150, 1000, 1234, 70],
  ];
  for (const [x1, y1, x2, y2] of rails) ladder.push(`M${x1} ${y1}L${x2} ${y2}`);
  for (let t = 0.04; t < 0.98; t += 0.062) {
    const y = 1000 + (70 - 1000) * t;
    const x = 1092 + (1176 - 1092) * t;
    ladder.push(`M${r(x)} ${r(y)}h58`);
  }

  // Stars, only where there is glass to see them through, and not on the moon.
  const stars: Hall['stars'] = [];
  while (stars.length < 46) {
    const x = 630 + rand() * 340;
    const y = 104 + rand() * 470;
    if (!insideGlass(x, y)) continue;
    if (Math.hypot(x - WINDOW.moon.cx, y - WINDOW.moon.cy) < WINDOW.moon.r + 22) continue;
    stars.push({ x: r(x), y: r(y), r: r(0.6 + rand() * 1.5), delay: r(rand() * 6) });
  }

  return {
    wood: wood.join(''),
    books: LEATHERS.map((color, i) => ({ color, d: byColor[i].join('') })),
    gilt: gilt.join(''),
    ladder: ladder.join(''),
    stars,
  };
}

function insideGlass(x: number, y: number): boolean {
  if (x < 626 || x > 974 || y > 840) return false;
  if (y >= 360) return true;
  return Math.hypot(x - 910, y - 360) <= 284 && Math.hypot(x - 690, y - 360) <= 284;
}

const r = (n: number) => Math.round(n * 10) / 10;
