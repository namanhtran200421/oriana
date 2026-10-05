import type { StoryEntry } from '../../core/story';

/**
 * The library's bookcase, laid out once and deterministically so the server
 * and the browser agree on every spine. Sizes are in em of a shelf row whose
 * font-size is its width divided by `ROW_EMS`, so a row is always exactly
 * full, from a phone to a desk-wide screen. Books marked `wide` only stand on
 * the longer shelves.
 */
export const ROW_EMS = { narrow: 28, wide: 76 } as const;

/** What a volume holds, known once its manuscript has been read in. */
export interface VolumeDetail {
  chapters: number;
  minutes: number;
}

/** Room left at the end of a row, where the last book leans on its neighbour. */
const SLACK = { narrow: 1.2, wide: 3.4 } as const;

export type ShelfObject = 'bookend' | 'inkwell' | 'hourglass' | 'stack' | 'reserved';

export interface VolumeItem {
  kind: 'volume';
  id: string;
  wide: false;
  story: StoryEntry;
  volume: number;
}

export interface BookItem {
  kind: 'book';
  id: string;
  wide: boolean;
  width: number;
  height: number;
  color: string;
  bands: boolean;
  gilt: boolean;
  /** Degrees, negative to lean left onto the neighbour; 0 stands upright. */
  lean: number;
  /** Space a leaning book needs at its foot. */
  offset: number;
}

export interface ObjectItem {
  kind: ShelfObject;
  id: string;
  wide: false;
}

export type ShelfItem = VolumeItem | BookItem | ObjectItem;

export interface ShelfRow {
  items: ShelfItem[];
}

export const WIDTHS: Record<ShelfObject | 'volume', number> = {
  volume: 4.4,
  bookend: 1.8,
  inkwell: 4.6,
  hourglass: 4.2,
  stack: 8.6,
  reserved: 8.4,
};

/** Old leathers, each a shade quieter than the volumes that can be taken down. */
const LEATHERS = [
  '#3b1d20',
  '#4a2c1c',
  '#1f2c25',
  '#1d2535',
  '#2b221e',
  '#55401f',
  '#3a2c40',
  '#2e3826',
  '#5a2424',
  '#243033',
];

const GAP = 'gap';
type Step = ShelfObject | typeof GAP | { story: StoryEntry; volume: number };

/** Volumes stand at most this many to a shelf; more stories add shelves. */
const PER_ROW = 4;

export function buildShelves(stories: readonly StoryEntry[]): ShelfRow[] {
  const groups: StoryEntry[][] = [];
  for (let i = 0; i < Math.max(stories.length, 1); i += PER_ROW) {
    groups.push(stories.slice(i, i + PER_ROW));
  }

  const rows = groups.map((group, r) => {
    const last = r === groups.length - 1;
    const plan: Step[] = ['bookend', GAP];
    for (const story of group) plan.push({ story, volume: stories.indexOf(story) + 1 }, GAP);
    plan.push(last ? 'inkwell' : 'bookend');
    return compose(plan, r);
  });

  rows.push(compose(['stack', GAP, 'hourglass', GAP, 'reserved', GAP], groups.length));
  return rows;
}

function compose(plan: Step[], row: number): ShelfRow {
  const rand = seeded(1307 + row * 97);
  const fixed = plan.reduce((sum, step) => sum + widthOf(step), 0);
  const gaps = plan.filter((step) => step === GAP).length;
  const narrowShare = Math.max(0, ROW_EMS.narrow - SLACK.narrow - fixed) / gaps;
  const wideShare = Math.max(0, ROW_EMS.wide - SLACK.wide - fixed) / gaps;

  const items: ShelfItem[] = [];
  const id = () => `${row}-${items.length}`;

  for (const step of plan) {
    if (step === GAP) {
      let used = 0;
      for (;;) {
        const width = round(1.1 + rand() * 1.3);
        if (used + width > wideShare) break;
        const banded = rand();
        items.push({
          kind: 'book',
          id: id(),
          wide: used + width > narrowShare,
          width,
          height: round(12.4 + rand() * 5.2),
          color: LEATHERS[Math.floor(rand() * LEATHERS.length)],
          bands: banded < 0.62,
          gilt: rand() < 0.55,
          lean: 0,
          offset: 0,
        });
        used += width;
      }
    } else if (typeof step === 'string') {
      items.push({ kind: step, id: id(), wide: false });
    } else {
      items.push({ kind: 'volume', id: id(), wide: false, ...step });
    }
  }

  // The last free-standing book leans into the room left at the end.
  const books = items.filter((item): item is BookItem => item.kind === 'book');
  const leaner = books.at(-1);
  if (leaner) {
    leaner.lean = -round(7 + rand() * 3);
    leaner.offset = round(leaner.height * Math.sin((-leaner.lean * Math.PI) / 180));
  }
  return { items };
}

function widthOf(step: Step): number {
  if (step === GAP) return 0;
  return typeof step === 'string' ? WIDTHS[step] : WIDTHS.volume;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Mulberry32: a tiny seeded generator, so every render draws the same shelf. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The width a row takes up at a given breakpoint, leaning books included. */
export function rowWidth(row: ShelfRow, tier: keyof typeof ROW_EMS): number {
  return row.items.reduce((sum, item) => {
    if (tier === 'narrow' && item.wide) return sum;
    if (item.kind === 'book') return sum + item.width + item.offset;
    return sum + WIDTHS[item.kind];
  }, 0);
}
