import { Component, computed, input } from '@angular/core';
import { labelsFor } from '../../core/i18n';
import { RomanPipe } from '../../core/roman';
import { StoryEntry, coverTransitionName } from '../../core/story';

/**
 * Tooled leather with a brass-stamped title. Shared by the reader's closed book
 * and the volume taken down from the library shelf, so one becomes the other.
 * Sizes follow `--page-w`, the width of the board it is set on.
 */
@Component({
  selector: 'app-book-cover',
  imports: [RomanPipe],
  templateUrl: './book-cover.html',
  styleUrl: './book-cover.scss',
  host: {
    '[attr.data-binding]': "story().binding ?? 'crimson'",
    '[attr.lang]': 'story().lang',
    '[style.view-transition-name]': 'named() ? transitionName() : null',
  },
})
export class BookCover {
  readonly story = input.required<StoryEntry>();
  readonly volume = input.required<number>();
  /** Only one cover at a time may take part in the shelf ↔ desk morph. */
  readonly named = input(false);

  protected readonly labels = computed(() => labelsFor(this.story().lang));
  protected readonly transitionName = computed(() => coverTransitionName(this.story().slug));
}
