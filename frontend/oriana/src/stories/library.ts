import type { StoryEntry } from '../app/core/story';

/**
 * The shelf, in reading order: each entry becomes "Volume I", "Volume II"…
 * The words themselves live in the matching .md file beside this one.
 */
export const LIBRARY: readonly StoryEntry[] = [
  // One book for now: our whole life together, a chapter at a time, growing
  // for as long as we do.
  {
    slug: 'until-our-last-page',
    title: 'Until Our Last Page',
    subtitle: 'The story of us, still being written',
    author: 'Nam Anh',
    lang: 'en',
    year: 2026,
    binding: 'crimson',
    featured: true,
    blurb: 'Hey, we have the same name, haha!',
    epigraph: { text: 'To the girl who found a piece of me I had long forgotten existed, and held it as though it had always belonged in her hands' },
    // A pressed flower a third of the way in, a clover two thirds (keepsakes).
    treasures: ['flower', 'clover'],
    load: () => import('./the-lantern-keeper.md').then((m) => m.default),
  },
];

export function findStory(slug: string | null | undefined): StoryEntry | undefined {
  return LIBRARY.find((story) => story.slug === slug);
}

export function volumeOf(story: StoryEntry): number {
  return LIBRARY.indexOf(story) + 1;
}
