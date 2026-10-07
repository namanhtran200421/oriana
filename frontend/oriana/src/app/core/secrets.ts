import { DOCUMENT, Injectable, inject } from '@angular/core';
import { SITE } from '../../stories/site';
import { Delight } from './delight';
import { KeepsakeId, Keepsakes } from './keepsakes';
import { readStored, today, writeStored } from './storage';
import { Toasts } from './toasts';

/** Words the house listens for, as letters only, without spaces or accents. */
const WORDS: ReadonlyArray<readonly [string, KeepsakeId]> = [
  ['oriana', 'whisper'],
  ['namanh', 'namesake'],
  ['vinglish', 'vinglish'],
  // The arcade code, as typed with arrows (u d l r) or spelled out.
  ['uuddlrlrba', 'konami'],
  ['upupdowndownleftrightleftrightba', 'konami'],
];

const ARROWS: Record<string, string> = {
  ArrowUp: 'u',
  ArrowDown: 'd',
  ArrowLeft: 'l',
  ArrowRight: 'r',
};

/** Remembered keystrokes: as many as the longest secret needs. */
const MEMORY = Math.max(...WORDS.map(([word]) => word.length));

export type WhisperResult = 'found' | 'again' | 'nothing';

/**
 * Secrets: a name typed anywhere on the keyboard, an old arcade code, a word
 * whispered into the locket, a visit in the small hours.
 */
@Injectable({ providedIn: 'root' })
export class Secrets {
  private readonly document = inject(DOCUMENT);
  private readonly keepsakes = inject(Keepsakes);
  private readonly delight = inject(Delight);
  private readonly toasts = inject(Toasts);
  private typed = '';

  /** Listens for typed secrets and notices the hour. Returns a function that stops listening. */
  start(): () => void {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
      const key = ARROWS[event.key] ?? (/^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : '');
      if (!key) return;
      this.typed = (this.typed + key).slice(-MEMORY);
      for (const [word, id] of WORDS) {
        if (this.typed.endsWith(word) && this.keepsakes.unlock(id)) {
          this.typed = '';
          this.celebrate();
          return;
        }
      }
    };
    this.document.addEventListener('keydown', onKey);

    // The small hours: found a moment after arriving, once the house has settled.
    const hour = new Date().getHours();
    const owl = hour < 4 ? setTimeout(() => this.keepsakes.unlock('owl'), 2500) : undefined;
    const occasion = setTimeout(() => this.celebrateToday(), 1800);

    return () => {
      this.document.removeEventListener('keydown', onKey);
      clearTimeout(owl);
      clearTimeout(occasion);
    };
  }

  /** A word whispered into the locket. */
  whisper(text: string): WhisperResult {
    const word = normalise(text);
    const match = WORDS.find(([secret]) => secret === word);
    if (!match) return 'nothing';
    if (!this.keepsakes.unlock(match[1])) return 'again';
    this.celebrate();
    return 'found';
  }

  private celebrate(): void {
    this.delight.rain(2600);
  }

  /** On a day worth celebrating, a note and falling hearts: once that day. */
  private celebrateToday(): void {
    const day = today();
    const occasion = SITE.celebrations?.find((c) => c.date === day.slice(5));
    if (!occasion || readStored('oriana:celebrated', '') === day) return;
    writeStored('oriana:celebrated', day);
    this.toasts.show(
      { overline: '♡', title: occasion.title, detail: occasion.message, icon: 'heart' },
      10_000,
    );
    this.delight.rain(5000);
  }
}

/** Letters only, lower case, accents taken off: "Nam Anh" and "namanh" agree. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[↑]/g, 'u')
    .replace(/[↓]/g, 'd')
    .replace(/[←]/g, 'l')
    .replace(/[→]/g, 'r')
    .replace(/[^a-z]/g, '');
}
