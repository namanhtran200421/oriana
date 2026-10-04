import { Component, computed, inject, input } from '@angular/core';
import { RomanPipe } from '../../../core/roman';
import { coverTransitionName } from '../../../core/story';
import { ReaderContext } from '../reader-context';

/** Tooled leather with a brass-stamped title. */
@Component({
  selector: 'app-book-cover',
  imports: [RomanPipe],
  templateUrl: './book-cover.html',
  styleUrl: './book-cover.scss',
  host: {
    '[attr.data-binding]': "ctx.story().binding ?? 'crimson'",
    '[style.view-transition-name]': 'named() ? transitionName() : null',
  },
})
export class BookCover {
  /** Only the resting, closed cover takes part in the shelf ↔ desk morph. */
  readonly named = input(false);

  protected readonly ctx = inject(ReaderContext);
  protected readonly transitionName = computed(() => coverTransitionName(this.ctx.story().slug));
}
