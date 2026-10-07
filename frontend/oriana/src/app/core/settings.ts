import { Injectable, PLATFORM_ID, afterNextRender, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { remembered } from './storage';

export interface Preferences {
  /** Little chimes for finds and games. The music has its own switch. */
  sounds: boolean;
  /** Hearts and sparks wherever the page is touched. */
  sparkles: boolean;
  /** Warmer, dimmer pages, for reading in the dark. */
  candlelight: boolean;
  /** The reader's type size, in steps from the book's own (see TEXT_SCALES). */
  textStep: number;
}

/** How much larger than the book's own type each step sets the text. */
export const TEXT_SCALES = [0.9, 1, 1.12, 1.25] as const;
const DEFAULT_STEP = 1;

const DEFAULTS: Preferences = {
  sounds: true,
  sparkles: true,
  candlelight: false,
  textStep: DEFAULT_STEP,
};

/** The visitor's preferences, remembered in this browser. */
@Injectable({ providedIn: 'root' })
export class Settings {
  private readonly store = remembered<Preferences>('oriana:settings', DEFAULTS);

  readonly sounds = computed(() => this.store.value().sounds);
  readonly sparkles = computed(() => this.store.value().sparkles);
  readonly candlelight = computed(() => this.store.value().candlelight);
  readonly textStep = computed(() =>
    Math.min(TEXT_SCALES.length - 1, Math.max(0, Math.round(this.store.value().textStep))),
  );
  readonly textScale = computed(() => TEXT_SCALES[this.textStep()]);
  readonly canShrink = computed(() => this.textStep() > 0);
  readonly canGrow = computed(() => this.textStep() < TEXT_SCALES.length - 1);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) afterNextRender(() => this.store.restore());
  }

  /** Reads the stored preferences now, for anything laid out before the first render. */
  restore(): void {
    this.store.restore();
  }

  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.store.update((current) => ({ ...current, [key]: value }));
  }

  toggle(key: 'sounds' | 'sparkles' | 'candlelight'): void {
    this.set(key, !this.store.value()[key]);
  }

  /** One step larger (1) or smaller (-1) type in the reader. */
  stepText(by: 1 | -1): void {
    this.set('textStep', Math.min(TEXT_SCALES.length - 1, Math.max(0, this.textStep() + by)));
  }
}
