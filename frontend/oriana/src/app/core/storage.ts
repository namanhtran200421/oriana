import { Signal, signal } from '@angular/core';

/**
 * Small, forgiving helpers around localStorage. Private browsing, a full
 * disk and the server all simply mean nothing is remembered.
 */
export function readStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered this time; everything still works for this visit.
  }
}

export interface Remembered<T> {
  readonly value: Signal<T>;
  /** Reads the browser's copy in, once. Safe to call as often as you like. */
  restore(): void;
  set(next: T): void;
  update(change: (current: T) => T): void;
}

/**
 * A signal kept in localStorage. It starts at `fallback` everywhere, so the
 * server's render and the browser's first one agree, and is read in from
 * storage when `restore()` is first called (after hydration) or before the
 * first change, whichever comes first.
 */
export function remembered<T>(key: string, fallback: T): Remembered<T> {
  const value = signal<T>(fallback);
  let restored = false;

  const restore = () => {
    if (restored || typeof window === 'undefined') return;
    restored = true;
    const stored = readStored<T>(key, fallback);
    const plain = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
    // New fields added since the visitor's last time keep their defaults.
    value.set(plain(fallback) && plain(stored) ? { ...fallback, ...stored } : stored);
  };

  return {
    value: value.asReadonly(),
    restore,
    set(next) {
      restore();
      value.set(next);
      writeStored(key, next);
    },
    update(change) {
      restore();
      const next = change(value());
      value.set(next);
      writeStored(key, next);
    },
  };
}

/** Today in the visitor's own time zone, as YYYY-MM-DD. */
export function today(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Whole days since 1 January 2026, by the visitor's calendar. */
export function dayNumber(at = new Date()): number {
  const start = Date.UTC(2026, 0, 1);
  const local = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
  return Math.floor((local - start) / 86_400_000);
}
