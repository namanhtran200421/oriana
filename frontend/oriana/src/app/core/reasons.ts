import { Injectable, PLATFORM_ID, afterNextRender, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { REASONS } from '../../stories/reasons';
import { Keepsakes } from './keepsakes';
import { remembered } from './storage';

/** The places beyond the window, in the order they are visited. */
export const WORLD_IDS = ['meadow', 'skies', 'valley'] as const;
export type WorldId = (typeof WORLD_IDS)[number];

export const isWorld = (id: string | null | undefined): id is WorldId =>
  (WORLD_IDS as readonly string[]).includes(id ?? '');

/** What a place is called, and the reasons kept there. */
export interface WorldWords {
  name: string;
  /** A line beneath its name. */
  line: string;
  /** How to find a reason here, e.g. "Touch a glowing flower". */
  hint: string;
  reasons: readonly string[];
}

const key = (world: WorldId, index: number) => `${world}:${index}`;

/**
 * Which reasons she has read, remembered in this browser. Reading every one
 * in a place is that place's keepsake.
 */
@Injectable({ providedIn: 'root' })
export class ReasonsRead {
  private readonly store = remembered<string[]>('oriana:reasons', []);
  private readonly keepsakes = inject(Keepsakes);

  readonly read = computed(() => new Set(this.store.value()));
  readonly total = WORLD_IDS.reduce((sum, id) => sum + REASONS[id].reasons.length, 0);
  /** Only reasons that still exist are counted, if some have been rewritten away. */
  readonly count = computed(() => WORLD_IDS.reduce((sum, id) => sum + this.countIn(id), 0));

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) afterNextRender(() => this.store.restore());
  }

  /** Reads stored progress in now, for a page that draws it straight away. */
  restore(): void {
    this.store.restore();
  }

  has(world: WorldId, index: number): boolean {
    return this.read().has(key(world, index));
  }

  countIn(world: WorldId): number {
    return REASONS[world].reasons.filter((_, i) => this.read().has(key(world, i))).length;
  }

  /** Marks a reason read; the place's keepsake comes with the last of them. */
  mark(world: WorldId, index: number): void {
    if (this.has(world, index)) return;
    this.store.update((all) => [...all, key(world, index)]);
    if (this.countIn(world) === REASONS[world].reasons.length) this.keepsakes.unlock(world);
  }
}
