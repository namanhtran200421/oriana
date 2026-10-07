import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { labelsFor } from '../../core/i18n';
import { playLabelsFor } from '../../core/i18n-play';
import { Journal } from '../../core/journal';
import { Keepsake, KeepsakeId, KeepsakePlace, Keepsakes } from '../../core/keepsakes';
import { Locket } from '../../core/locket';
import { ReasonsRead } from '../../core/reasons';
import { Secrets, WhisperResult } from '../../core/secrets';
import { Settings } from '../../core/settings';
import { dayNumber } from '../../core/storage';
import { Sfx } from '../../core/sfx';
import { LAST_LETTER } from '../../../stories/keepsakes';
import { SITE } from '../../../stories/site';
import { Icon } from '../icon';

type Tab = 'treasures' | 'journal' | 'settings';

const PLACES: readonly Exclude<KeepsakePlace, 'last'>[] = [
  'library',
  'books',
  'reasons',
  'secrets',
];

/**
 * The locket: every keepsake found so far, each with its note, and a hint
 * or two for the ones still hidden. Also the house's little journal, and its
 * settings. Lives once at the root of the app; opened through `Locket`.
 */
@Component({
  selector: 'app-keepsake-box',
  imports: [Icon],
  templateUrl: './keepsake-box.html',
  styleUrl: './keepsake-box.scss',
})
export class KeepsakeBox {
  protected readonly labels = playLabelsFor(SITE.lang);
  protected readonly chrome = labelsFor(SITE.lang);
  protected readonly keepsakes = inject(Keepsakes);
  protected readonly journal = inject(Journal);
  protected readonly reasons = inject(ReasonsRead);
  protected readonly settings = inject(Settings);
  protected readonly letter = LAST_LETTER;
  protected readonly tabs: readonly Tab[] = ['treasures', 'journal', 'settings'];
  protected readonly groups = PLACES.map((place) => ({
    place,
    items: this.keepsakes.all.filter((k) => k.place === place),
  }));
  protected readonly last = this.keepsakes.all.find((k) => k.id === 'last')!;

  /** Nothing inside is drawn until the locket is first opened. */
  protected readonly ever = signal(false);
  protected readonly tab = signal<Tab>('treasures');
  protected readonly selected = signal<KeepsakeId | null>(null);
  protected readonly reading = signal(false);
  /** Found since the locket was last opened: they shimmer once. */
  protected readonly fresh = signal<ReadonlySet<KeepsakeId>>(new Set());
  protected readonly whispered = signal<WhisperResult | null>(null);
  protected readonly resetArmed = signal(false);
  protected readonly resetDone = signal(false);

  protected readonly found = this.keepsakes.foundMap;
  protected readonly share = computed(() => this.keepsakes.count() / this.keepsakes.total);
  protected readonly detail = computed<Keepsake | null>(
    () => this.keepsakes.all.find((k) => k.id === this.selected()) ?? null,
  );
  protected readonly left = computed(() => this.keepsakes.total - 1 - this.keepsakes.count());
  /** Days since we met, if the day is set in site.ts. */
  protected readonly together = computed(() => {
    if (!SITE.metOn || !this.ever()) return null;
    const [y, m, d] = SITE.metOn.split('-').map(Number);
    const days = dayNumber() - dayNumber(new Date(y, m - 1, d));
    return days >= 0 ? days : null;
  });

  private readonly secrets = inject(Secrets);
  private readonly sfx = inject(Sfx);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly dates = new Intl.DateTimeFormat(SITE.lang === 'vi' ? 'vi-VN' : 'en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  private readonly locket = inject(Locket);

  constructor() {
    const unregister = this.locket.register((focus) => this.open(focus));
    inject(DestroyRef).onDestroy(unregister);
  }

  open(focus: KeepsakeId | null): void {
    const dialog = this.dialog().nativeElement;
    this.ever.set(true);
    this.fresh.set(this.keepsakes.unseen());
    this.keepsakes.seen();
    this.tab.set('treasures');
    this.selected.set(focus);
    this.reading.set(focus === 'last' && this.keepsakes.has('last'));
    this.whispered.set(null);
    this.resetArmed.set(false);
    this.resetDone.set(false);
    if (!dialog.open) dialog.showModal();
    this.locket.isOpen.set(true);
    if (focus) {
      // Once the tiles are drawn, bring the one asked for into view.
      requestAnimationFrame(() =>
        dialog
          .querySelector(`[data-keepsake-tile="${focus}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      );
    }
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** However it was closed: the button, the backdrop, or Esc. */
  protected onClosed(): void {
    this.locket.isOpen.set(false);
  }

  protected onClick(event: MouseEvent): void {
    // A click on the backdrop lands on the <dialog> itself.
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected select(id: KeepsakeId): void {
    this.sfx.play('click');
    this.selected.set(this.selected() === id ? null : id);
    this.reading.set(false);
  }

  protected hint(id: KeepsakeId): void {
    this.sfx.play('pop');
    this.keepsakes.revealHint(id);
  }

  protected readLetter(): void {
    this.sfx.play('flip');
    this.reading.set(true);
  }

  protected whisper(input: HTMLInputElement, event: Event): void {
    event.preventDefault();
    if (!input.value.trim()) return;
    const result = this.secrets.whisper(input.value);
    this.whispered.set(result);
    if (result === 'nothing') this.sfx.play('miss');
    else input.value = '';
  }

  protected reset(): void {
    if (!this.resetArmed()) {
      this.resetArmed.set(true);
      return;
    }
    this.keepsakes.reset();
    this.journal.reset();
    this.selected.set(null);
    this.resetArmed.set(false);
    this.resetDone.set(true);
  }

  protected date(iso: string | null | undefined): string {
    return iso ? this.dates.format(new Date(iso)) : '';
  }
}
