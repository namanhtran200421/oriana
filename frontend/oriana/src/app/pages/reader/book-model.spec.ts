import { labelsFor } from '../../core/i18n';
import { parseManuscript } from '../../core/manuscript';
import type { StoryEntry } from '../../core/story';
import {
  anchorPage,
  assemblePages,
  buildSections,
  facesAt,
  lastSpread,
  pageOfPosition,
  positionOf,
  spreadOfPage,
  withContents,
} from './book-model';

const story: StoryEntry = {
  slug: 'test',
  title: 'A Test',
  author: 'Someone',
  lang: 'en',
  year: 2026,
  blurb: '',
  load: async () => '',
};
const labels = labelsFor('en');
const manuscript = parseManuscript('# One\n\nText.\n\n# Two\n\nMore text.');
const sections = buildSections(story, manuscript, labels);
// bookplate, title, verso, contents, chapter One, chapter Two, finis
const counts = [1, 1, 1, 1, 3, 2, 1];

describe('book model', () => {
  it('orders the parts of a printed book', () => {
    expect(sections.map((s) => s.kind)).toEqual([
      'bookplate', 'title', 'verso', 'contents', 'chapter', 'chapter', 'finis',
    ]);
    expect(sections[4].label).toBe('Chapter I');
  });

  it('opens every chapter on a right-hand page in a spread', () => {
    const pages = assemblePages(sections, counts, 'spread', story.title);
    const openers = pages.filter((p) => p.kind === 'chapter' && p.opener);
    expect(openers.every((p) => p.index % 2 === 1)).toBe(true);
    expect(pages.length % 2).toBe(0);
  });

  it('never inserts blanks on a single page', () => {
    const pages = assemblePages(sections, counts, 'single', story.title);
    expect(pages.some((p) => p.kind === 'blank' || p.kind === 'endpaper')).toBe(false);
    expect(pages).toHaveLength(counts.reduce((a, b) => a + b, 0));
  });

  it('numbers body pages from the first chapter and runs heads after openers', () => {
    const pages = assemblePages(sections, counts, 'single', story.title);
    const body = pages.filter((p) => p.kind === 'chapter');
    expect(body.map((p) => p.folio)).toEqual([1, 2, 3, 4, 5]);
    expect(body[0].runningHead).toBeNull();
    expect(body[1].runningHead).toBe('One');
  });

  it('prints real folios in the contents once pages are known', () => {
    const pages = assemblePages(sections, counts, 'single', story.title);
    const toc = withContents(sections, pages, labels).find((s) => s.kind === 'contents')!;
    expect(toc.source).toContain('data-goto="4"');
    expect(toc.source).toMatch(/One<\/span><span class="toc__leader"><\/span><span class="toc__folio">1</);
    expect(toc.source).toMatch(/Two<\/span><span class="toc__leader"><\/span><span class="toc__folio">4</);
  });

  it('shows the cover when closed and two pages when open', () => {
    const pages = assemblePages(sections, counts, 'spread', story.title);
    expect(facesAt('spread', pages, 0).right.type).toBe('cover');
    const open = facesAt('spread', pages, 1);
    expect(open.left).toEqual({ type: 'page', page: pages[0] });
    expect(open.right).toEqual({ type: 'page', page: pages[1] });
    expect(lastSpread('spread', pages.length)).toBe(pages.length / 2);
  });

  it('keeps the reader on the same passage across layouts', () => {
    const spread = assemblePages(sections, counts, 'spread', story.title);
    const single = assemblePages(sections, counts, 'single', story.title);
    const page = spread.find((p) => p.kind === 'chapter' && p.column === 2)!;
    const position = positionOf(spread, page.index)!;
    const same = single[pageOfPosition(single, position)];
    expect([same.section, same.column]).toEqual([page.section, page.column]);
  });

  it('anchors a spread on its first real page, skipping blanks', () => {
    const pages = assemblePages(sections, counts, 'spread', story.title);
    const blank = pages.find((p) => p.kind === 'blank')!;
    const anchor = anchorPage('spread', pages, spreadOfPage('spread', blank.index))!;
    expect(anchor.kind).toBe('chapter');
  });
});
