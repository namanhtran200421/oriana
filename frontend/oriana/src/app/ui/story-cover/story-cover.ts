import { Component, computed, input } from '@angular/core';
import { RomanPipe } from '../../core/roman';
import { StoryEntry, coverTransitionName } from '../../core/story';

/**
 * The arch-topped plate a volume shows on the shelf: the story's own image in
 * sepia if it has one, otherwise a tooled-leather plate in its binding.
 * Shares a view-transition name with the reader's book cover so one becomes
 * the other on navigation.
 */
@Component({
  selector: 'app-story-cover',
  imports: [RomanPipe],
  templateUrl: './story-cover.html',
  styleUrl: './story-cover.scss',
  host: {
    '[attr.data-binding]': "story().binding ?? 'crimson'",
    '[attr.lang]': 'story().lang',
    '[style.view-transition-name]': 'transitionName()',
  },
})
export class StoryCover {
  readonly story = input.required<StoryEntry>();
  readonly volume = input.required<number>();

  protected readonly transitionName = computed(() => coverTransitionName(this.story().slug));
}
