import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { labelsFor } from '../../../core/i18n';
import { playLabelsFor } from '../../../core/i18n-play';
import { Keepsakes } from '../../../core/keepsakes';
import { prefersReducedMotion } from '../../../core/motion';
import { Sfx } from '../../../core/sfx';
import { SITE } from '../../../../stories/site';
import type { ShelfObject } from '../shelf';

/** A full sand-glass takes a minute to run through. */
const SAND_MS = 60_000;

/**
 * The things kept on a shelf between the books: a brass bookend, an inkwell
 * and quill, a pile of books laid flat, an hourglass that can be turned, and a
 * gap kept for the stories still to be written.
 * Drawn in em of the shelf row, like the books around them.
 */
@Component({
  selector: 'app-curio',
  templateUrl: './curio.html',
  styleUrl: './curio.scss',
  host: {
    '[attr.data-kind]': 'kind()',
    '[attr.aria-hidden]': "kind() === 'reserved' ? null : 'true'",
  },
})
export class Curio {
  readonly kind = input.required<ShelfObject>();

  protected readonly labels = labelsFor(SITE.lang);
  protected readonly play = playLabelsFor(SITE.lang);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly glass = viewChild<ElementRef<SVGElement>>('glass');
  private readonly keepsakes = inject(Keepsakes);
  private readonly sfx = inject(Sfx);
  private sand?: Animation;
  private turning = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (this.kind() !== 'hourglass' || prefersReducedMotion()) return;
      this.pour(0.32);
      destroyRef.onDestroy(() => this.sand?.cancel());
    });
  }

  /** The inkwell rocks on its base; the stack of books shuffles. Either is a find. */
  protected touch(keepsake: 'inkwell' | 'pile'): void {
    this.sfx.play(keepsake === 'inkwell' ? 'tick' : 'flip');
    this.keepsakes.unlock(keepsake);
    if (prefersReducedMotion()) return;
    this.host.animate(
      [
        { rotate: '0deg' },
        { rotate: '-5deg' },
        { rotate: '4deg' },
        { rotate: '-2deg' },
        { rotate: '0deg' },
      ],
      { duration: 650, easing: 'ease-out' },
    );
  }

  /** Turned over, the sand that had run through starts back from the top. */
  protected flip(): void {
    const glass = this.glass()?.nativeElement;
    if (!glass || this.turning || prefersReducedMotion()) return;
    const drained = this.sand ? Number(this.sand.currentTime ?? 0) / SAND_MS : 1;
    this.sand?.pause();
    this.turning = true;
    const turn = glass.animate([{ rotate: '0deg' }, { rotate: '180deg' }], {
      duration: 950,
      easing: 'cubic-bezier(0.55, 0, 0.25, 1)',
    });
    turn.onfinish = () => {
      this.turning = false;
      this.pour(1 - Math.min(1, drained));
    };
  }

  private pour(drained: number): void {
    this.sand?.cancel();
    this.sand = this.host.animate([{ '--sand': 0 }, { '--sand': 1 }], {
      duration: SAND_MS,
      fill: 'forwards',
    });
    this.sand.currentTime = drained * SAND_MS;
  }
}
