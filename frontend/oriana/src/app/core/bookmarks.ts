import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Where a reader left off. Stored as a section plus a fraction through it, so
 * the place survives a different screen size or a re-flowed page count.
 */
export interface Bookmark {
  section: number;
  fraction: number;
  /** Human label for the library shelf, e.g. "Chapter II". */
  label: string;
  finished: boolean;
}

const KEY = 'oriana:bookmark:';

@Injectable({ providedIn: 'root' })
export class Bookmarks {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  get(slug: string): Bookmark | null {
    if (!this.browser) return null;
    try {
      const raw = localStorage.getItem(KEY + slug);
      return raw ? (JSON.parse(raw) as Bookmark) : null;
    } catch {
      return null;
    }
  }

  set(slug: string, mark: Bookmark): void {
    if (!this.browser) return;
    try {
      localStorage.setItem(KEY + slug, JSON.stringify(mark));
    } catch {
      // Private mode or full storage: reading still works, it just won't be remembered.
    }
  }
}
