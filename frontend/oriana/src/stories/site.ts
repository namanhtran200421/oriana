import type { SiteConfig } from '../app/core/story';

/**
 * Everything personal about the collection: who it is for, who wrote it, and
 * the little note in the library. Keep it short; the stories do the talking.
 */
export const SITE: SiteConfig = {
  lang: 'en',
  recipient: 'Oriana',
  monogram: 'O',
  author: 'Nam Anh',
  title: "Oriana",
  tagline: 'Stories of Us',
  place: 'Melbourne',
  year: 2026,
  preface: {
    label: 'Just a Note',
    heading: 'Hi :>',
    paragraphs: ["I wrote these because I wanted to keep our memories, and perhaps remind our childs of how you and I became who we are. I hope you enjoy the reads, although I'm not sure if it's any good. Love you theee mooosttt :)))"],
    signature: 'Steve',
  },
  music: {
    // Begins when the seal is broken, fades in softly and loops.
    youtube: 'https://www.youtube.com/watch?v=YcEUd8mKYH8&list=RDYcEUd8mKYH8&start_radio=1',
    volume: 45,
  },
};
