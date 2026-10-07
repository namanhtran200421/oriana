import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { Delight } from '../../core/delight';
import { labelsFor } from '../../core/i18n';
import { playLabelsFor } from '../../core/i18n-play';
import { Keepsakes } from '../../core/keepsakes';
import { Locket } from '../../core/locket';
import { Sfx } from '../../core/sfx';
import { SITE } from '../../../stories/site';

/** Taps this close together count as stroking her. */
const PET_WINDOW_MS = 4000;
const PETS_TO_PURR = 5;
const SAY_MS = 7000;
const PURR_MS = 2600;
const GREET_AFTER_MS = 6500;

/** She says hello once a visit, not on every page. */
let greeted = false;

type Mood = 'idle' | 'talking' | 'purring';

/**
 * The library cat. She peeps in at the edge of the page, blinks slowly, and
 * when tapped, tells you where to look for something you haven't found.
 * Stroked a few times in a row, she purrs.
 */
@Component({
  selector: 'app-companion',
  templateUrl: './companion.html',
  styleUrl: './companion.scss',
  host: {
    '[class.is-talking]': "mood() === 'talking'",
    '[class.is-purring]': "mood() === 'purring'",
    '[class.is-awake]': 'awake()',
  },
})
export class Companion {
  protected readonly labels = playLabelsFor(SITE.lang);
  protected readonly close = labelsFor(SITE.lang).close;
  protected readonly name = SITE.companion ?? 'Mochi';
  protected readonly mood = signal<Mood>('idle');
  protected readonly words = signal('');
  /** Whether the bubble offers the locket. */
  protected readonly withLocket = signal(false);
  /** She leans in once the page has settled, rather than being there from the start. */
  protected readonly awake = signal(false);
  protected readonly hearts = signal<readonly number[]>([]);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly keepsakes = inject(Keepsakes);
  private readonly locket = inject(Locket);
  private readonly sfx = inject(Sfx);
  private readonly delight = inject(Delight);
  private pets: number[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private nextHeart = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const wake = setTimeout(() => this.awake.set(true), 900);
      const greet = setTimeout(() => {
        if (greeted || this.keepsakes.complete() || this.mood() !== 'idle') return;
        greeted = true;
        this.say(this.labels.catGreeting, false);
      }, GREET_AFTER_MS);
      destroyRef.onDestroy(() => {
        clearTimeout(wake);
        clearTimeout(greet);
        clearTimeout(this.timer);
      });
    });
  }

  protected tap(): void {
    const now = performance.now();
    this.pets = [...this.pets.filter((t) => now - t < PET_WINDOW_MS), now];
    if (this.pets.length >= PETS_TO_PURR) {
      this.pets = [];
      this.purr();
      return;
    }

    this.sfx.play('meow');
    this.heart();
    const next = this.keepsakes.nextHint();
    if (next) this.say(this.labels.catHint(next.hint), true);
    else this.say(this.labels.catAllFound, false);
  }

  protected openLocket(event: Event): void {
    event.stopPropagation();
    this.hush();
    this.locket.open();
  }

  protected hush(): void {
    clearTimeout(this.timer);
    this.mood.set('idle');
  }

  private purr(): void {
    this.sfx.play('purr');
    const box = this.host.getBoundingClientRect();
    this.delight.burst(box.left + box.width * 0.6, box.top + box.height * 0.3, 12);
    for (let i = 0; i < 4; i++) setTimeout(() => this.heart(), i * 220);
    this.mood.set('purring');
    this.words.set(this.labels.catPurrs);
    this.withLocket.set(false);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.mood.set('idle'), PURR_MS);
    // Earned the moment she purrs, even if the page is left before she stops.
    setTimeout(() => this.keepsakes.unlock('cat'), PURR_MS / 2);
  }

  private say(words: string, withLocket: boolean): void {
    this.words.set(words);
    this.withLocket.set(withLocket);
    this.mood.set('talking');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.mood.set('idle'), SAY_MS);
  }

  /** A small heart floats up from her head, and is gone. */
  private heart(): void {
    const id = ++this.nextHeart;
    this.hearts.update((all) => [...all.slice(-5), id]);
    setTimeout(() => this.hearts.update((all) => all.filter((h) => h !== id)), 1600);
  }
}
