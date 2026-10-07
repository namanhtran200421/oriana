import { Injectable } from '@angular/core';
import { Manuscript, parseManuscript } from './manuscript';
import type { StoryEntry } from './story';

/**
 * Each story's text, loaded and parsed once per visit. The library reads
 * them for their chapter counts; the reader then opens them without waiting.
 */
@Injectable({ providedIn: 'root' })
export class Manuscripts {
  private readonly cache = new Map<string, Promise<Manuscript>>();

  get(story: StoryEntry): Promise<Manuscript> {
    let manuscript = this.cache.get(story.slug);
    if (!manuscript) {
      manuscript = story.load().then(parseManuscript);
      // A failed load is not remembered, so the next visit can try again.
      manuscript.catch(() => this.cache.delete(story.slug));
      this.cache.set(story.slug, manuscript);
    }
    return manuscript;
  }
}
