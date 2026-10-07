import { Injectable, PLATFORM_ID, afterNextRender, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { IconName } from '../ui/icon';
import { KEEPSAKES } from '../../stories/keepsakes';
import { SITE } from '../../stories/site';
import { Delight } from './delight';
import { playLabelsFor } from './i18n-play';
import { Journal } from './journal';
import { Locket } from './locket';
import { Sfx } from './sfx';
import { remembered } from './storage';
import { Toasts } from './toasts';

/**
 * Everything that can be found, in the order the locket shows it. The words
 * for each live in `src/stories/keepsakes.ts`; this list is what the code
 * listens for.
 */
export const KEEPSAKE_IDS = [
  // In the library
  'seal',
  'letter',
  'lamp',
  'inkwell',
  'pile',
  'shelf',
  'cat',
  // Between the pages
  'flower',
  'clover',
  'finis',
  'pages',
  // Beyond the window
  'window',
  'meadow',
  'skies',
  'valley',
  // Secrets
  'whisper',
  'namesake',
  'vinglish',
  'konami',
  'owl',
  // For finding everything else
  'last',
] as const;

export type KeepsakeId = (typeof KEEPSAKE_IDS)[number];
export type KeepsakePlace = 'library' | 'books' | 'reasons' | 'secrets' | 'last';

export interface KeepsakeEntry {
  name: string;
  icon: IconName;
  place: KeepsakePlace;
  /** A gentle nudge. */
  hint: string;
  /** Plainly where to look, for when the nudge is not enough. */
  clue: string;
  /** What it says once found. */
  note: string;
}

export interface Keepsake extends KeepsakeEntry {
  id: KeepsakeId;
}

/** The final letter, opened by finding everything else. */
export interface LastLetter {
  heading: string;
  paragraphs: readonly string[];
  signature: string;
}

/** Revealed hints per keepsake: 0 none, 1 the hint, 2 the clue as well. */
type HintLevels = Partial<Record<KeepsakeId, number>>;
/** When each keepsake was found, as an ISO date. */
type Found = Partial<Record<KeepsakeId, string>>;

const CELEBRATE_LAST_MS = 2600;

/**
 * The treasure hunt. Little things are hidden all over the house; each one
 * found is kept in the locket with a note, and finding every one opens the
 * last letter.
 */
@Injectable({ providedIn: 'root' })
export class Keepsakes {
  readonly all: readonly Keepsake[] = KEEPSAKE_IDS.map((id) => ({ id, ...KEEPSAKES[id] }));
  readonly total = KEEPSAKE_IDS.length;

  private readonly found = remembered<Found>('oriana:keepsakes', {});
  private readonly hints = remembered<HintLevels>('oriana:hints', {});
  /** Found since the locket was last opened, for the little dot on its button. */
  readonly unseen = signal<ReadonlySet<KeepsakeId>>(new Set());

  readonly foundMap = this.found.value;
  /** Only keepsakes this version knows of are counted, whatever else is stored. */
  readonly count = computed(() => KEEPSAKE_IDS.filter((id) => this.found.value()[id]).length);
  readonly complete = computed(() => this.count() >= this.total);

  private readonly labels = playLabelsFor(SITE.lang);
  private readonly toasts = inject(Toasts);
  private readonly sfx = inject(Sfx);
  private readonly delight = inject(Delight);
  private readonly locket = inject(Locket);
  private readonly journal = inject(Journal);
  private hintCursor = 0;

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      afterNextRender(() => {
        this.found.restore();
        this.hints.restore();
      });
    }
  }

  has(id: KeepsakeId): boolean {
    return !!this.found.value()[id];
  }

  foundAt(id: KeepsakeId): string | null {
    return this.found.value()[id] ?? null;
  }

  hintLevel(id: KeepsakeId): number {
    return this.hints.value()[id] ?? 0;
  }

  /** Shows one more hint for a keepsake: first the nudge, then the clue. */
  revealHint(id: KeepsakeId): void {
    this.hints.restore();
    const level = this.hintLevel(id);
    if (level >= 2 || this.has(id)) return;
    this.hints.update((all) => ({ ...all, [id]: level + 1 }));
    this.journal.count('hintsUsed');
  }

  /**
   * Marks a keepsake found, with a chime and a note at the edge of the page.
   * Returns false if it had been found before.
   */
  unlock(id: KeepsakeId): boolean {
    this.found.restore();
    if (this.has(id)) return false;
    this.found.update((all) => ({ ...all, [id]: new Date().toISOString() }));
    this.unseen.update((ids) => new Set([...ids, id]));

    const entry = KEEPSAKES[id];
    const first = this.count() === 1;
    const left = this.total - this.count();
    this.sfx.play('chime');
    this.toasts.show({
      overline: id === 'last' ? this.labels.everyKeepsake : this.labels.keepsakeFound,
      title: entry.name,
      icon: entry.icon,
      detail: first ? this.labels.firstFind(left) : undefined,
      action: { label: this.labels.openLocket, run: () => this.locket.open(id) },
    });

    if (id === 'last') {
      this.delight.rain(5000);
    } else if (left === 1 && !this.has('last')) {
      // Everything else is found: the last letter opens of its own accord.
      setTimeout(() => this.unlock('last'), CELEBRATE_LAST_MS);
    }
    return true;
  }

  /** Marks keepsakes as seen, when the locket is opened. */
  seen(): void {
    if (this.unseen().size) this.unseen.set(new Set());
  }

  /**
   * A hint for something not yet found, a different one each time it is
   * asked for, or null once everything has been found.
   */
  nextHint(): Keepsake | null {
    const missing = this.all.filter((k) => k.id !== 'last' && !this.has(k.id));
    if (!missing.length) return null;
    return missing[this.hintCursor++ % missing.length];
  }

  /** Forgets every find and hint, to hunt again from the start. */
  reset(): void {
    this.found.set({});
    this.hints.set({});
    this.unseen.set(new Set());
    this.hintCursor = 0;
  }
}
