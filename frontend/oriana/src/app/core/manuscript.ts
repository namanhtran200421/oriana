/**
 * A deliberately small Markdown dialect for writing novels:
 *
 *   # Chapter title            starts a chapter (numbered I, II, III…)
 *   # Prologue {-}             starts an unnumbered chapter
 *   ## A heading               small engraved heading inside a chapter
 *   *italic*  _italic_         emphasis;  **bold** for the rare shout
 *   > A letter…                letters & verse; line breaks are kept
 *   * * *                      scene break (also *** or ---)
 *   ![Caption](plates/x.jpg)   an arch-topped plate on its own line
 *
 * Straight quotes, -- and ... are set as proper typography.
 * Everything is escaped: the manuscript can never inject markup.
 */

export interface ManuscriptChapter {
  /** Plain text, for running heads and the contents page. */
  title: string;
  /** Typeset title HTML. */
  titleHtml: string;
  numbered: boolean;
  /** Body HTML; the first paragraph carries the drop cap. */
  html: string;
  words: number;
}

export interface Manuscript {
  chapters: ManuscriptChapter[];
  words: number;
}

interface Draft {
  title: string;
  numbered: boolean;
  blocks: string[];
  words: number;
}

const CHAPTER = /^#\s+(.*)$/;
const HEADING = /^#{2,}\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const SCENE_BREAK = /^\s*(?:\*\s*\*\s*\*|-{3,}|_{3,}|⁂)\s*$/;
const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const UNNUMBERED = /\s*\{(?:-|\.unnumbered)\}\s*$/;
const HARD_BREAK = /(?: {2,}|\\)$/;

export function parseManuscript(source: string): Manuscript {
  const lines = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const chapters: ManuscriptChapter[] = [];
  let draft: Draft | null = null;
  let paragraph: string[] = [];
  let quote: string[] | null = null;

  const current = (): Draft => (draft ??= { title: '', numbered: false, blocks: [], words: 0 });

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const chapter = current();
    chapter.blocks.push(`<p>${renderLines(paragraph, false)}</p>`);
    chapter.words += countWords(paragraph.join(' '));
    paragraph = [];
  };

  const flushQuote = () => {
    if (!quote) return;
    const chapter = current();
    const stanzas = splitOnBlank(quote).map((lines) => `<p>${renderLines(lines, true)}</p>`);
    if (stanzas.length) chapter.blocks.push(`<blockquote>${stanzas.join('')}</blockquote>`);
    chapter.words += countWords(quote.join(' '));
    quote = null;
  };

  const flushChapter = () => {
    flushParagraph();
    flushQuote();
    if (draft && (draft.blocks.length || draft.title)) chapters.push(finish(draft));
    draft = null;
  };

  for (const raw of lines) {
    const quoted = QUOTE.exec(raw);
    if (quoted) {
      flushParagraph();
      (quote ??= []).push(quoted[1]);
      continue;
    }
    flushQuote();

    const trimmed = raw.trim();
    const chapter = CHAPTER.exec(trimmed);
    if (chapter) {
      flushChapter();
      const numbered = !UNNUMBERED.test(chapter[1]);
      draft = { title: chapter[1].replace(UNNUMBERED, '').trim(), numbered, blocks: [], words: 0 };
      continue;
    }

    const heading = HEADING.exec(trimmed);
    if (heading) {
      flushParagraph();
      current().blocks.push(`<h3>${inline(heading[1])}</h3>`);
      continue;
    }

    if (SCENE_BREAK.test(raw)) {
      flushParagraph();
      current().blocks.push('<hr class="scene-break">');
      continue;
    }

    const figure = FIGURE.exec(trimmed);
    if (figure) {
      flushParagraph();
      current().blocks.push(renderFigure(figure[1], figure[2]));
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    paragraph.push(raw);
  }
  flushChapter();

  return { chapters, words: chapters.reduce((sum, c) => sum + c.words, 0) };
}

function finish(draft: Draft): ManuscriptChapter {
  const lead = draft.blocks.findIndex((block) => block.startsWith('<p>'));
  if (lead >= 0) draft.blocks[lead] = draft.blocks[lead].replace('<p>', '<p class="lead">');
  return {
    title: plain(draft.title),
    titleHtml: inline(draft.title),
    numbered: draft.numbered,
    html: draft.blocks.join('\n'),
    words: draft.words,
  };
}

/** Joins source lines, honouring Markdown hard breaks (or every break, for letters). */
function renderLines(lines: string[], keepBreaks: boolean): string {
  const text = lines
    .map((line, i) => {
      const last = i === lines.length - 1;
      const hard = keepBreaks || HARD_BREAK.test(line);
      const content = line.replace(HARD_BREAK, '').trim();
      return last ? content : content + (hard ? '\n' : ' ');
    })
    .join('');
  return inline(text).replace(/\n/g, '<br>');
}

function renderFigure(caption: string, src: string): string {
  const safeSrc = /^(?:https?:)?\/\/|^[\w./-]+$/.test(src) ? src : '';
  if (!safeSrc) return '';
  const alt = escapeHtml(plain(caption));
  const figcaption = caption.trim() ? `<figcaption>${inline(caption)}</figcaption>` : '';
  return (
    `<figure class="plate"><img src="${escapeHtml(safeSrc)}" alt="${alt}" ` +
    `loading="lazy" decoding="async" draggable="false">${figcaption}</figure>`
  );
}

export function inline(text: string): string {
  return escapeHtml(smarten(text))
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\p{L}\p{N}])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}])/gu, '$1<em>$2</em>');
}

/** Curly quotes, em dashes and ellipses. */
export function smarten(text: string): string {
  const opener = '(^|[\\s([{\\u2014\\u2013*_-])';
  return text
    .replace(/---|--/g, '—')
    .replace(/\.\.\./g, '…')
    .replace(new RegExp(opener + '"', 'g'), '$1“')
    .replace(/"/g, '”')
    .replace(new RegExp(opener + "'", 'g'), '$1‘')
    .replace(/'/g, '’');
}

function plain(text: string): string {
  return smarten(text).replace(/\*\*|\*|(^|\W)_|_(?=\W|$)/g, '$1').trim();
}

function splitOnBlank(lines: string[]): string[][] {
  const groups: string[][] = [[]];
  for (const line of lines) {
    if (line.trim()) groups[groups.length - 1].push(line);
    else if (groups[groups.length - 1].length) groups.push([]);
  }
  return groups.filter((group) => group.length);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
