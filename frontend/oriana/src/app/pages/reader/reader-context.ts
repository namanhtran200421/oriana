import { Injectable, Signal, computed, signal } from '@angular/core';
import { labelsFor } from '../../core/i18n';
import type { StoryEntry } from '../../core/story';
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
