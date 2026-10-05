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
  /** Background music: any YouTube link, looped softly. Omit for silence. */
  music?: {
    youtube: string;
    /** 0–100. */
    volume?: number;
  };
}

export const coverTransitionName = (slug: string) => `cover-${slug}`;
