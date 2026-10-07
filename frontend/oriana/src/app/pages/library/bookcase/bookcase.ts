import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { Bookmark } from '../../../core/bookmarks';
import { labelsFor } from '../../../core/i18n';
import { playLabelsFor } from '../../../core/i18n-play';
import { Keepsakes } from '../../../core/keepsakes';
import { prefersReducedMotion } from '../../../core/motion';
import { Sfx } from '../../../core/sfx';
import { RomanPipe, toRoman } from '../../../core/roman';
import type { StoryEntry } from '../../../core/story';
import { Reveal } from '../../../ui/reveal';
import { SITE } from '../../../../stories/site';
import { Curio } from '../curio/curio';
import { Spine } from '../spine/spine';
import { BookItem, ObjectItem, ShelfItem, VolumeDetail, VolumeItem, buildShelves } from '../shelf';

export interface TakenVolume {
  story: StoryEntry;
  volume: number;
  /** The spine as it stands on the shelf, for the flight to the reading stand. */
  spine: HTMLElement;
}

/**
 * A carved walnut bookcase. Oriana's volumes stand among old books that make
 * room for her hand: neighbours lean aside as she reaches for one, and now
 * and then a book stirs on its own.
 */
@Component({
  selector: 'app-bookcase',
  imports: [Curio, RomanPipe, Reveal, Spine],
  templateUrl: './bookcase.html',
  styleUrl: './bookcase.scss',
})
export class Bookcase {
  readonly stories = input.required<readonly StoryEntry[]>();
  readonly marks = input<Partial<Record<string, Bookmark>>>({});
  readonly details = input<Partial<Record<string, VolumeDetail>>>({});
  /** The volume off the shelf, whose place stands empty until it returns. */
  readonly taken = input<string | null>(null);
  readonly take = output<TakenVolume>();

  protected readonly labels = labelsFor(SITE.lang);
  protected readonly play = playLabelsFor(SITE.lang);
  /** The lamp over the case can be switched off, and on again. */
  protected readonly lampOff = signal(false);
  protected readonly rows = computed(() => buildShelves(this.stories()));
  protected readonly hovered = signal<VolumeItem | null>(null);
  protected readonly plate = computed(() => `${this.labels.exLibris} · ${SITE.recipient}`);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly keepsakes = inject(Keepsakes);
  private readonly sfx = inject(Sfx);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (prefersReducedMotion()) return;
      destroyRef.onDestroy(this.stirNowAndThen());
    });
  }

  protected asVolume = (item: ShelfItem) => item as VolumeItem;
  protected asBook = (item: ShelfItem) => item as BookItem;
  protected asObject = (item: ShelfItem) => item as ObjectItem;

  protected ariaFor(volume: VolumeItem): string {
    return `${this.labels.volume} ${toRoman(volume.volume)}: ${volume.story.title}`;
  }

  protected toggleLamp(): void {
    this.sfx.play('click');
    const off = !this.lampOff();
    this.lampOff.set(off);
    // Lit again after being put out: the lamplighter's keepsake.
    if (!off) this.keepsakes.unlock('lamp');
  }

  protected takeDown(volume: VolumeItem, event: Event): void {
    const spine = (event.currentTarget as HTMLElement).querySelector('app-spine') as HTMLElement;
    this.hovered.set(null);
    this.take.emit({ story: volume.story, volume: volume.volume, spine });
  }

  /** Every so often a book on a visible shelf shifts, as if someone passed. */
  private stirNowAndThen(): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = false;
    const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    observer.observe(this.host);

    const stir = () => {
      if (visible && !document.hidden) {
        const books = [...this.host.querySelectorAll<HTMLElement>('.book:not(.is-leaning)')].filter(
          (book) => book.offsetParent !== null,
        );
        const book = books[Math.floor(Math.random() * books.length)];
        if (book) {
          book.classList.add('is-stirring');
          book.addEventListener('animationend', () => book.classList.remove('is-stirring'), {
            once: true,
          });
        }
      }
      timer = setTimeout(stir, 4500 + Math.random() * 6000);
    };
    timer = setTimeout(stir, 3500);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }
}
