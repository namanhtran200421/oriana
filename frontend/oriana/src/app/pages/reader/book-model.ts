import type { SafeHtml } from '@angular/platform-browser';
import type { Labels } from '../../core/i18n';
import { Manuscript, escapeHtml } from '../../core/manuscript';
import { toRoman } from '../../core/roman';
import type { StoryEntry } from '../../core/story';
import type { BookMode } from './layout';

// ---------------------------------------------------------------------------
// Sections: the parts of a printed book, in order.
// ---------------------------------------------------------------------------

export type SectionKind = 'bookplate' | 'title' | 'verso' | 'contents' | 'chapter' | 'finis';

export interface SectionDraft {
  kind: SectionKind;
  /** Flowed sections are paginated through CSS columns; others fill one page. */
  flow: boolean;
  title: string;
  /** "Chapter III"; null for front matter and unnumbered chapters. */
  label: string | null;
  numeral: string | null;
  /** Generated HTML for flowed sections. */
  source: string | null;
}

export interface BookSection extends SectionDraft {
  html: SafeHtml | null;
}

const FLEURON = '❦︎';
const STAR = '✶︎';

export function buildSections(
  story: StoryEntry,
  manuscript: Manuscript,
  labels: Labels,
): SectionDraft[] {
  const fixed = (kind: SectionKind, title: string): SectionDraft => ({
    kind,
    flow: false,
    title,
    label: null,
    numeral: null,
    source: null,
  });

  let count = 0;
  const chapters = manuscript.chapters.map((chapter): SectionDraft => {
    const numeral = chapter.numbered ? toRoman(++count) : null;
    const label = numeral ? `${labels.chapter} ${numeral}` : null;
    const head =
      (label ? `<p class="chapter-head__label">${escapeHtml(label)}</p>` : '') +
      (chapter.titleHtml ? `<h2 class="chapter-head__title">${chapter.titleHtml}</h2>` : '') +
      `<div class="ornate-divider" aria-hidden="true">${FLEURON}</div>`;
    return {
      kind: 'chapter',
      flow: true,
      title: chapter.title,
      label,
      numeral,
      source: `<header class="chapter-head">${head}</header>\n${chapter.html}`,
    };
  });

  const sections: SectionDraft[] = [
    fixed('bookplate', labels.exLibris),
    fixed('title', labels.titlePage),
    fixed('verso', story.title),
    { kind: 'contents', flow: true, title: labels.contents, label: null, numeral: null, source: '' },
    ...chapters,
    fixed('finis', labels.finis),
  ];
  return withContents(sections, null, labels);
}

/**
 * Re-renders the contents page. Folios are unknown until the chapters have
 * been measured, so the first pass prints placeholders of a similar width.
 */
export function withContents(
  sections: readonly SectionDraft[],
  pages: readonly BookPageRef[] | null,
  labels: Labels,
): SectionDraft[] {
  const entries = sections
    .map((section, index) => {
      if (section.kind !== 'chapter') return '';
      const folio = pages ? (pages.find((page) => page.section === index)?.folio ?? '') : '00';
      return (
        `<li><button type="button" class="toc__entry" tabindex="-1" data-goto="${index}">` +
        `<span class="toc__num">${section.numeral ?? FLEURON}</span>` +
        `<span class="toc__title">${escapeHtml(section.title)}</span>` +
        `<span class="toc__leader"></span><span class="toc__folio">${folio}</span></button></li>`
      );
    })
    .join('');
  const source =
    `<header class="matter-head"><p class="matter-head__label">${escapeHtml(labels.contents)}</p>` +
    `<div class="ornate-divider" aria-hidden="true">${STAR}</div></header>` +
    `<ol class="toc">${entries}</ol>`;
  return sections.map((section) => (section.kind === 'contents' ? { ...section, source } : section));
}

// ---------------------------------------------------------------------------
// Pages: sections laid out as numbered leaves.
// ---------------------------------------------------------------------------

export type PageKind = SectionKind | 'blank' | 'endpaper';
export type PageSide = 'verso' | 'recto';

export interface BookPageRef {
  index: number;
  kind: PageKind;
  /** Index into the sections; -1 for blanks and endpapers. */
  section: number;
  /** Which column of a flowed section this page shows. */
  column: number;
  /** Printed page number; body pages only. */
  folio: number | null;
  runningHead: string | null;
  /** First page of its section. */
  opener: boolean;
}

/**
 * Lays sections out as pages. In a two-page spread every chapter opens on a
 * right-hand page, as in a printed novel, with a blank verso where needed.
 */
export function assemblePages(
  sections: readonly SectionDraft[],
  counts: readonly number[],
  mode: BookMode,
  storyTitle: string,
): BookPageRef[] {
  const pages: BookPageRef[] = [];
  const push = (kind: PageKind, section: number, column: number) =>
    pages.push({
      index: pages.length,
      kind,
      section,
      column,
      folio: null,
      runningHead: null,
      opener: column === 0,
    });

  sections.forEach((section, index) => {
    if (section.kind === 'chapter' && mode === 'spread' && pages.length % 2 === 0) {
      push('blank', -1, 0);
    }
    const count = section.flow ? Math.max(1, counts[index] ?? 1) : 1;
    for (let column = 0; column < count; column++) push(section.kind, index, column);
  });
  if (mode === 'spread' && pages.length % 2 === 1) push('endpaper', -1, 0);

  const firstBody = pages.findIndex((page) => page.kind === 'chapter');
  for (const page of pages) {
    if (firstBody < 0 || page.kind !== 'chapter') continue;
    page.folio = page.index - firstBody + 1;
    if (!page.opener) {
      const verso = mode === 'spread' && page.index % 2 === 0;
      page.runningHead = verso ? storyTitle : sections[page.section].title || storyTitle;
    }
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Spreads: what lies open on the desk. Spread 0 is the closed book.
// ---------------------------------------------------------------------------

export type Face =
  | { type: 'cover' }
  | { type: 'page'; page: BookPageRef }
  | { type: 'paper' }
  | { type: 'none' };

export interface SpreadFaces {
  left: Face;
  right: Face;
}

export const COVER: Face = { type: 'cover' };
export const PAPER: Face = { type: 'paper' };
export const NONE: Face = { type: 'none' };

export const spreadOfPage = (mode: BookMode, index: number): number =>
  mode === 'spread' ? Math.floor(index / 2) + 1 : index + 1;

export const lastSpread = (mode: BookMode, pageCount: number): number =>
  pageCount === 0 ? 0 : mode === 'spread' ? Math.ceil(pageCount / 2) : pageCount;

export function pagesOn(mode: BookMode, spread: number): number[] {
  if (spread <= 0) return [];
  return mode === 'spread' ? [spread * 2 - 2, spread * 2 - 1] : [spread - 1];
}

export function facesAt(
  mode: BookMode,
  pages: readonly BookPageRef[],
  spread: number,
): SpreadFaces {
  if (spread <= 0) return { left: NONE, right: COVER };
  const face = (index: number): Face =>
    pages[index] ? { type: 'page', page: pages[index] } : PAPER;
  const [first, second] = pagesOn(mode, spread);
  return mode === 'spread' ? { left: face(first), right: face(second) } : { left: NONE, right: face(first) };
}

/** The page that best represents a spread: its first one with real content. */
export function anchorPage(
  mode: BookMode,
  pages: readonly BookPageRef[],
  spread: number,
): BookPageRef | null {
  const visible = pagesOn(mode, spread)
    .map((index) => pages[index])
    .filter((page): page is BookPageRef => !!page);
  return visible.find((page) => page.section >= 0) ?? visible[0] ?? null;
}

// ---------------------------------------------------------------------------
// Reading position: layout-independent, so it survives a re-flow.
// ---------------------------------------------------------------------------

export interface ReadingPosition {
  section: number;
  fraction: number;
}

export function positionOf(
  pages: readonly BookPageRef[],
  index: number,
): ReadingPosition | null {
  const page =
    pages.slice(index).find((p) => p.section >= 0) ??
    pages
      .slice(0, index)
      .reverse()
      .find((p) => p.section >= 0);
  if (!page) return null;
  const count = pages.filter((p) => p.section === page.section).length;
  return { section: page.section, fraction: page.column / count };
}

export function pageOfPosition(
  pages: readonly BookPageRef[],
  position: ReadingPosition,
): number {
  const own = pages.filter((page) => page.section === position.section);
  if (!own.length) return 0;
  const column = Math.min(own.length - 1, Math.floor(position.fraction * own.length + 1e-6));
  return own[column].index;
}
