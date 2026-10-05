import { NgTemplateOutlet } from '@angular/common';
import { Component, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Bookmark, Bookmarks } from '../../core/bookmarks';
import { labelsFor } from '../../core/i18n';
import { parseManuscript } from '../../core/manuscript';
import { prefersReducedMotion } from '../../core/motion';
import { RomanPipe } from '../../core/roman';
import type { StoryEntry } from '../../core/story';
import { Cursor } from '../../ui/cursor';
import { InkText } from '../../ui/ink-text';
import { MusicToggle } from '../../ui/music-toggle';
import { Reveal } from '../../ui/reveal';
import { WaxSeal } from '../../ui/wax-seal/wax-seal';
import { LIBRARY } from '../../../stories/library';
import { SITE } from '../../../stories/site';
import { Bookcase, TakenVolume } from './bookcase/bookcase';
import { ReadingRoom } from './reading-room/reading-room';
import { LibraryScene } from './scene/library-scene';
import type { VolumeDetail } from './shelf';
import { VolumeViewer } from './volume-viewer/volume-viewer';

const WORDS_PER_MINUTE = 220;

/**
 * The library. Where the browser can draw it, a reading room in three
 * dimensions; otherwise, or for those who would rather things kept still,
 * the hall, the preface and the bookcase drawn flat.
 */
@Component({
  selector: 'app-library',
  imports: [
    Bookcase,
    Cursor,
    InkText,
    LibraryScene,
    MusicToggle,
    NgTemplateOutlet,
    ReadingRoom,
    RomanPipe,
    Reveal,
    RouterLink,
    VolumeViewer,
    WaxSeal,
  ],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library {
  protected readonly site = SITE;
  protected readonly labels = labelsFor(SITE.lang);
  protected readonly stories = LIBRARY;
  protected readonly marks = signal<Partial<Record<string, Bookmark>>>({});
  protected readonly details = signal<Partial<Record<string, VolumeDetail>>>({});
  /** The volume off the shelf and on the reading stand, if any. */
  protected readonly taken = signal<string | null>(null);
  protected readonly room = signal(true);

  private readonly bookmarks = inject(Bookmarks);
  private readonly router = inject(Router);
  private readonly viewer = viewChild.required(VolumeViewer);

  constructor() {
    // Browser-only: bookmarks live in localStorage, and loading the manuscripts
    // here also warms them for the reader.
    afterNextRender(() => {
      if (prefersReducedMotion() || !canDrawRoom()) this.room.set(false);

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

  protected takeDown(volume: TakenVolume): void {
    this.taken.set(volume.story.slug);
    this.viewer().open(volume);
  }

  protected read(story: StoryEntry): void {
    void this.router.navigate(['/read', story.slug]);
  }
}

function canDrawRoom(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
