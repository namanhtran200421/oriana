import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Delight } from '../../core/delight';
import { labelsFor } from '../../core/i18n';
import { Keepsakes } from '../../core/keepsakes';
import type { StoryEntry, Treasure } from '../../core/story';
import { volumeOf } from '../../../stories/library';
import {
  BookPageRef,
  BookSection,
  SpreadFaces,
  anchorPage,
  facesAt,
  lastSpread,
  spreadOfPage,
} from './book-model';
import { BookLayout, computeLayout } from './layout';

/** Shared state for one open book: the reader page, the book and its pages. */
@Injectable()
export class ReaderContext {
  /** Bound by the reader to its route-resolved story. */
  story!: Signal<StoryEntry>;

  readonly layout = signal<BookLayout>(computeLayout(1280, 800));
  readonly sections = signal<readonly BookSection[]>([]);
  readonly pages = signal<readonly BookPageRef[]>([]);
  /** 0 is the closed book; 1 opens on the bookplate and title page. */
  readonly spread = signal(0);
  /** Where opening the cover should land: a bookmark, or the beginning. */
  readonly openTo = signal(1);

  readonly labels = computed(() => labelsFor(this.story().lang));
  readonly volume = computed(() => volumeOf(this.story()));
  readonly mode = computed(() => this.layout().mode);
  readonly ready = computed(() => this.pages().length > 0);
  readonly lastSpread = computed(() => lastSpread(this.mode(), this.pages().length));
  readonly totalFolios = computed(() =>
    this.pages().reduce((max, page) => Math.max(max, page.folio ?? 0), 0),
  );
  readonly progress = computed(() => {
    const last = this.lastSpread();
    return last > 1 ? Math.min(1, Math.max(0, (this.spread() - 1) / (last - 1))) : 0;
  });

  private readonly keepsakes = inject(Keepsakes);
  private readonly delight = inject(Delight);

  /**
   * The pages pressed keepsakes lie on (a flower, a clover…), spaced evenly
   * through the body of the book, each gone once it has been found.
   */
  readonly treasures = computed(() => {
    const placed = new Map<number, Treasure>();
    const treasures = this.story().treasures ?? [];
    const body = this.pages().filter((page) => page.kind === 'chapter' && !page.opener);
    if (!body.length) return placed;
    treasures.forEach((treasure, i) => {
      if (this.keepsakes.foundMap()[treasure]) return;
      const at = Math.floor((body.length * (i + 1)) / (treasures.length + 1));
      placed.set(body[Math.min(at, body.length - 1)].index, treasure);
    });
    return placed;
  });

  /** A pressed keepsake, picked up from the page where it was touched. */
  findTreasure(treasure: Treasure, x: number, y: number): void {
    this.delight.burst(x, y, 14);
    this.keepsakes.unlock(treasure);
  }

  facesAt(spread: number): SpreadFaces {
    return facesAt(this.mode(), this.pages(), spread);
  }

  anchorAt(spread: number): BookPageRef | null {
    return anchorPage(this.mode(), this.pages(), spread);
  }

  spreadOfSection(section: number): number {
    const page = this.pages().find((p) => p.section === section);
    return page ? spreadOfPage(this.mode(), page.index) : 1;
  }
}
