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
  // The library cat: she sits by the page and gives hints when tapped.
  companion: 'Mochi',
  // The day of the very first message, as YYYY-MM-DD. Set it, and the locket's
  // journal counts the days since.
  // metOn: '2025-01-01',
  // Days that bring a note and falling hearts when she visits (month-day).
  celebrations: [
    { date: '01-01', title: 'Happy New Year', message: 'Another whole year of us. Lucky me.' },
    {
      date: '02-14',
      title: 'Happy Valentine’s Day',
      message: 'Every day, but especially today.',
    },
    { date: '12-25', title: 'Merry Christmas', message: 'All I wanted was right here.' },
  ],
  music: {
    // Begins when the seal is broken and fades in softly; the songs play in
    // turn, and round again.
    youtube: [
      'https://www.youtube.com/watch?v=oFFFL9EMpBM&list=PLqmQfBdlieG6Voy_53q1FGwfqkqU0D0SU&index=4',
      'https://www.youtube.com/watch?v=aarD1Qc6nG8&list=PLqmQfBdlieG6Voy_53q1FGwfqkqU0D0SU&index=5',
    ],
    volume: 45,
  },
};
