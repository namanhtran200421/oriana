import { NgTemplateOutlet } from '@angular/common';
import { Component, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Bookmark, Bookmarks } from '../../core/bookmarks';
import { labelsFor } from '../../core/i18n';
import { playLabelsFor } from '../../core/i18n-play';
import { Keepsakes } from '../../core/keepsakes';
import { Manuscripts } from '../../core/manuscripts';
import { WORLD_IDS } from '../../core/reasons';
import { prefersReducedMotion } from '../../core/motion';
import { canDrawWebGL2 } from '../../core/webgl';
import { RomanPipe } from '../../core/roman';
import type { StoryEntry } from '../../core/story';
import { Companion } from '../../ui/companion/companion';
import { Cursor } from '../../ui/cursor';
import { Icon } from '../../ui/icon';
import { InkText } from '../../ui/ink-text';
import { LocketButton } from '../../ui/locket-button';
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
    Companion,
    Cursor,
    Icon,
    InkText,
    LibraryScene,
    LocketButton,
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
  protected readonly play = playLabelsFor(SITE.lang);
  protected readonly stories = LIBRARY;
  protected readonly marks = signal<Partial<Record<string, Bookmark>>>({});
  protected readonly details = signal<Partial<Record<string, VolumeDetail>>>({});
  /** The volume off the shelf and on the reading stand, if any. */
  protected readonly taken = signal<string | null>(null);
  protected readonly room = signal(true);
  /** "Just for you" on the server; by the hour of her visit, in the browser. */
  protected readonly greeting = signal(this.labels.justForYou);
  protected readonly keepsakes = inject(Keepsakes);

  private readonly bookmarks = inject(Bookmarks);
  private readonly manuscripts = inject(Manuscripts);
  private readonly router = inject(Router);
  private readonly viewer = viewChild.required(VolumeViewer);
  private readonly readingRoom = viewChild(ReadingRoom);

  constructor() {
    // Browser-only: bookmarks live in localStorage, and loading the manuscripts
    // here also warms them for the reader.
    afterNextRender(() => {
      if (prefersReducedMotion() || !canDrawWebGL2()) this.room.set(false);
      this.greeting.set(this.play.greeting(new Date().getHours()));

      const marks: Partial<Record<string, Bookmark>> = {};
      for (const story of LIBRARY) {
        const mark = this.bookmarks.get(story.slug);
        if (mark) marks[story.slug] = mark;
      }
      this.marks.set(marks);

      // Parsed once and shared with the reader; the shelf is told all at once.
      void Promise.all(
        LIBRARY.map((story) =>
          this.manuscripts.get(story).then(
            ({ chapters, words }) =>
              [
                story.slug,
                {
                  chapters: chapters.length,
                  minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
                },
              ] as const,
            () => null,
          ),
        ),
      ).then((entries) => {
        const details: Partial<Record<string, VolumeDetail>> = {};
        for (const entry of entries) if (entry) details[entry[0]] = entry[1];
        this.details.set(details);
      });
    });
  }

  protected takeDown(volume: TakenVolume): void {
    this.taken.set(volume.story.slug);
    this.viewer().open(volume);
    this.keepsakes.unlock('shelf');
  }

  protected read(story: StoryEntry): void {
    void this.router.navigate(['/read', story.slug]);
  }

  /** In the room, out through the window; on the flat page, straight there. */
  protected toReasons(): void {
    const room = this.readingRoom();
    if (room) void room.throughWindow();
    else this.wander();
  }

  protected wander(): void {
    this.keepsakes.unlock('window');
    void this.router.navigate(['/reasons', WORLD_IDS[0]]);
  }
}
