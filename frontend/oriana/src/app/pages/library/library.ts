import { Component, afterNextRender, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Bookmark, Bookmarks } from '../../core/bookmarks';
import { labelsFor } from '../../core/i18n';
import { parseManuscript } from '../../core/manuscript';
import { RomanPipe } from '../../core/roman';
import { MusicToggle } from '../../ui/music-toggle';
import { Reveal } from '../../ui/reveal';
import { StoryCover } from '../../ui/story-cover/story-cover';
import { WaxSeal } from '../../ui/wax-seal/wax-seal';
import { LIBRARY } from '../../../stories/library';
import { SITE } from '../../../stories/site';

interface VolumeDetail {
  chapters: number;
  minutes: number;
}

const WORDS_PER_MINUTE = 220;

/** The preface and the shelf of collected volumes. */
@Component({
  selector: 'app-library',
  imports: [RouterLink, MusicToggle, RomanPipe, Reveal, StoryCover, WaxSeal],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library {
  protected readonly site = SITE;
  protected readonly labels = labelsFor(SITE.lang);
  protected readonly stories = LIBRARY;
  protected readonly marks = signal<Partial<Record<string, Bookmark>>>({});
  protected readonly details = signal<Partial<Record<string, VolumeDetail>>>({});

  private readonly bookmarks = inject(Bookmarks);

  constructor() {
    // Browser-only: bookmarks live in localStorage, and loading the manuscripts
    // here also warms them for the reader.
    afterNextRender(() => {
      const marks: Partial<Record<string, Bookmark>> = {};
      for (const story of LIBRARY) {
        const mark = this.bookmarks.get(story.slug);
        if (mark) marks[story.slug] = mark;
      }
      this.marks.set(marks);

      for (const story of LIBRARY) {
        void story.load().then((text) => {
          const { chapters, words } = parseManuscript(text);
          const detail = {
            chapters: chapters.length,
            minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
          };
          this.details.update((all) => ({ ...all, [story.slug]: detail }));
        });
      }
    });
  }
}
