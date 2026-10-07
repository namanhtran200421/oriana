import { Injectable, PLATFORM_ID, afterNextRender, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { remembered, today } from './storage';

interface JournalState {
  /** The first visit, as YYYY-MM-DD. */
  since: string | null;
  visits: number;
  /** Distinct days with a visit, and the latest of them. */
  days: number;
  lastDay: string | null;
  pagesTurned: number;
  hintsUsed: number;
  /** Slugs of the stories read to the end. */
  finished: string[];
}

const EMPTY: JournalState = {
  since: null,
  visits: 0,
  days: 0,
  lastDay: null,
  pagesTurned: 0,
  hintsUsed: 0,
  finished: [],
};

/** A little diary the house keeps: visits, days, pages turned, hints asked for. */
@Injectable({ providedIn: 'root' })
export class Journal {
  private readonly store = remembered<JournalState>('oriana:journal', EMPTY);

  readonly state = this.store.value;

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) afterNextRender(() => this.store.restore());
  }

  /** Called once as the house opens. */
  visit(): void {
    const day = today();
    this.store.update((s) => ({
      ...s,
      since: s.since ?? day,
      visits: s.visits + 1,
      days: s.lastDay === day ? s.days : s.days + 1,
      lastDay: day,
    }));
  }

  /** Adds one to a tally and returns the new total. */
  count(tally: 'pagesTurned' | 'hintsUsed'): number {
    this.store.update((s) => ({ ...s, [tally]: s[tally] + 1 }));
    return this.state()[tally];
  }

  finish(slug: string): void {
    if (this.state().finished.includes(slug)) return;
    this.store.update((s) => ({ ...s, finished: [...s.finished, slug] }));
  }

  /** Forgets the tallies, but not when the visits began. */
  reset(): void {
    this.store.update((s) => ({
      ...EMPTY,
      since: s.since,
      visits: s.visits,
      days: s.days,
      lastDay: s.lastDay,
    }));
  }
}
