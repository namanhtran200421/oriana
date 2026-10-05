import { Component, input } from '@angular/core';
import { RomanPipe } from '../../../core/roman';
import type { StoryEntry } from '../../../core/story';
import { WaxSeal } from '../../../ui/wax-seal/wax-seal';

/**
 * A volume's spine: raised bands, a dark lettering-piece with the title in
 * gilt, the volume's numeral above. Drawn entirely in em, so the same spine
 * stands on the shelf and turns on the reading stand at any size.
 */
@Component({
  selector: 'app-spine',
  imports: [RomanPipe, WaxSeal],
  template: `
    <span class="spine__band spine__band--1"></span>
    <span class="spine__band spine__band--2"></span>
    <span class="spine__numeral">{{ volume() | roman }}</span>
    <span class="spine__label">
      <span class="spine__title">{{ story().title }}</span>
    </span>
    @if (story().featured) {
      <app-wax-seal class="spine__seal" size="2.1em" />
    } @else {
      <span class="spine__fleuron">❦</span>
    }
    <span class="spine__band spine__band--3"></span>
    <span class="spine__band spine__band--4"></span>
    @if (finished()) {
      <span class="spine__star">✶</span>
    }
  `,
  styleUrl: './spine.scss',
  host: {
    'aria-hidden': 'true',
    '[attr.data-binding]': "story().binding ?? 'crimson'",
    '[attr.lang]': 'story().lang',
  },
})
export class Spine {
  readonly story = input.required<StoryEntry>();
  readonly volume = input.required<number>();
  /** Read to the last page: a small gilt star is tooled at the head. */
  readonly finished = input(false);
}
