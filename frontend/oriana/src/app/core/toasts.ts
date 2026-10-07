import { Injectable, signal } from '@angular/core';
import type { IconName } from '../ui/icon';

export interface Toast {
  id: number;
  overline: string;
  title: string;
  icon: IconName;
  detail?: string;
  action?: { label: string; run: () => void };
  /** Set while it slips away. */
  leaving: boolean;
}

export type ToastInput = Omit<Toast, 'id' | 'leaving'>;

const MAX_SHOWN = 3;
const LEAVE_MS = 450;

/** Little notes that slip in at the edge of the page and go again by themselves. */
@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly list = signal<readonly Toast[]>([]);
  private next = 0;

  show(toast: ToastInput, duration = 6000): number {
    const id = ++this.next;
    this.list.update((all) => [...all.slice(-(MAX_SHOWN - 1)), { ...toast, id, leaving: false }]);
    setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  dismiss(id: number): void {
    const toast = this.list().find((t) => t.id === id);
    if (!toast || toast.leaving) return;
    this.list.update((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => this.list.update((all) => all.filter((t) => t.id !== id)), LEAVE_MS);
  }
}
