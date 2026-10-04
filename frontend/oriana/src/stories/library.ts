import type { StoryEntry } from '../app/core/story';

/**
 * The shelf, in reading order: each entry becomes "Volume I", "Volume II"…
 * The words themselves live in the matching .md file beside this one.
 */
export const LIBRARY: readonly StoryEntry[] = [
  {
    slug: 'the-lantern-keeper',
    title: 'Same Firstname, Different Surname',
    subtitle: 'The Beginning',
    author: 'Nam Anh',
    lang: 'en',
    year: 2026,
    binding: 'crimson',
    featured: true,
    blurb: 'Hey, we have the same name, haha!',
    epigraph: { text: 'The girl whom got a part of me where I`ve forgotten' },
    load: () => import('./the-lantern-keeper.md').then((m) => m.default),
  },
  {
    slug: 'ngon-den-ben-cua-so',
    title: 'Ngọn Đèn Bên Cửa Sổ',
    subtitle: 'Một truyện ngắn',
    author: 'Nam Anh',
    lang: 'vi',
    year: 2026,
    binding: 'mahogany',
    blurb: 'Một ngọn đèn nhỏ, và những lá thư chưa gửi.',
    epigraph: { text: 'Có ánh đèn chỉ để chờ một người.' },
    load: () => import('./ngon-den-ben-cua-so.md').then((m) => m.default),
  },
];

export function findStory(slug: string | null | undefined): StoryEntry | undefined {
  return LIBRARY.find((story) => story.slug === slug);
}

export function volumeOf(story: StoryEntry): number {
  return LIBRARY.indexOf(story) + 1;
}
