import type { StoryEntry } from '../../core/story';
import { ROW_EMS, buildShelves, rowWidth } from './shelf';

const story = (slug: string): StoryEntry => ({
  slug,
  title: slug,
  author: 'Nam Anh',
  lang: 'en',
  year: 2026,
  blurb: '',
  load: async () => '',
});

describe('buildShelves', () => {
  const stories = ['a', 'b', 'c', 'd', 'e'].map(story);

  it('draws the same shelf on every render', () => {
    expect(buildShelves(stories)).toEqual(buildShelves(stories));
  });

  it('stands every volume on a shelf exactly once, in order', () => {
    const volumes = buildShelves(stories)
      .flatMap((row) => row.items)
      .filter((item) => item.kind === 'volume');
    expect(volumes.map((v) => [v.story.slug, v.volume])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
      ['e', 5],
    ]);
  });

  it('never overfills a shelf, narrow or wide', () => {
    for (const count of [0, 1, 2, 4, 5]) {
      for (const row of buildShelves(stories.slice(0, count))) {
        expect(rowWidth(row, 'narrow')).toBeLessThanOrEqual(ROW_EMS.narrow);
        expect(rowWidth(row, 'wide')).toBeLessThanOrEqual(ROW_EMS.wide);
      }
    }
  });

  it('leans one book at the end of each shelf', () => {
    for (const row of buildShelves(stories)) {
      const leaning = row.items.filter((item) => item.kind === 'book' && item.lean !== 0);
      expect(leaning.length).toBe(1);
    }
  });
});
