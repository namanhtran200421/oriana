export type Lang = 'en' | 'vi';

/** Leather the volume is bound in, used for its cover and library plate. */
export type Binding = 'crimson' | 'mahogany' | 'oak';

export interface StoryEntry {
  /** URL segment: lowercase ASCII and hyphens only. */
  slug: string;
  title: string;
  subtitle?: string;
  author: string;
  lang: Lang;
  year: number;
  /** One or two sentences for the library shelf. */
  blurb: string;
  binding?: Binding;
  /** Optional image path under /public, shown arch-topped and sepia-toned. */
  cover?: string;
  /** Marks the volume with a wax seal on the shelf. */
  featured?: boolean;
  /** Printed alone on the page facing the contents. */
  epigraph?: { text: string; source?: string };
  /** Line printed beneath "Finis"; falls back to a gentle thank-you. */
  closing?: string;
  /** Keepsakes pressed between its pages, spaced evenly through the book, for her to find. */
  treasures?: readonly Treasure[];
  /** Lazily loads the manuscript text. */
  load: () => Promise<string>;
}

export interface SiteConfig {
  /** Language of the threshold and library. Each story sets its own. */
  lang: Lang;
  recipient: string;
  monogram: string;
  author: string;
  title: string;
  tagline: string;
  /** Where the stories happened, set small beneath her name. */
  place?: string;
  year: number;
  preface: {
    label: string;
    heading: string;
    paragraphs: readonly string[];
    signature: string;
  };
  /** The library cat, who keeps an eye on things and gives hints. */
  companion?: string;
  /** The day it all began, as YYYY-MM-DD: the locket's journal counts the days since. */
  metOn?: string;
  /** Days that bring a little note and falling hearts when she visits. */
  celebrations?: readonly Celebration[];
  /**
   * Background music: a YouTube link, or several to play in turn, round and
   * round, softly. Omit for silence.
   */
  music?: {
    youtube: string | readonly string[];
    /** 0–100. */
    volume?: number;
  };
}

export type Treasure = 'flower' | 'clover';

export interface Celebration {
  /** Month and day, as MM-DD. */
  date: string;
  title: string;
  message?: string;
}

export const coverTransitionName = (slug: string) => `cover-${slug}`;
