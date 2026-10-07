import { Injectable, signal } from '@angular/core';
import type { KeepsakeId } from './keepsakes';

/**
 * Opens the locket from anywhere: a button in the masthead, a toast, a
 * hint from the cat. The locket itself (ui/keepsake-box) lives once, at the
 * root of the app, and registers here.
 */
@Injectable({ providedIn: 'root' })
export class Locket {
  /** Open over the page: anything drawn beneath it can rest. */
  readonly isOpen = signal(false);
  private opener?: (focus: KeepsakeId | null) => void;

  register(opener: (focus: KeepsakeId | null) => void): () => void {
    this.opener = opener;
    return () => {
      if (this.opener === opener) this.opener = undefined;
    };
  }

  open(focus: KeepsakeId | null = null): void {
    this.opener?.(focus);
  }
}
