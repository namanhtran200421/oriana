export type BookMode = 'spread' | 'single';

/** Every measurement the book needs, in whole CSS pixels. */
export interface BookLayout {
  mode: BookMode;
  pageW: number;
  pageH: number;
  padX: number;
  padTop: number;
  padBottom: number;
  /** The text block. Its height is a whole number of lines. */
  flowW: number;
  flowH: number;
  /** Column gap between flowed pages; any value works as long as it is shared. */
  gap: number;
  fontSize: number;
  leading: number;
  barTop: number;
  barBottom: number;
}

const PAGE_RATIO = 1.42;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Sizes the book for a viewport: an open two-page spread when there is room
 * for one, a single page (bound on the left) on phones and narrow windows.
 * `textScale` sets the type larger or smaller than the page would choose.
 */
export function computeLayout(viewportW: number, viewportH: number, textScale = 1): BookLayout {
  const compact = viewportW < 720 || viewportH < 520;
  const barTop = compact ? 56 : 72;
  const barBottom = compact ? 84 : 76;
  const gutterX = compact ? 12 : viewportW < 1100 ? 76 : 112;
  const stageW = Math.max(260, viewportW - gutterX * 2);
  const stageH = Math.max(240, viewportH - barTop - barBottom - (compact ? 8 : 32));
  const mode: BookMode = !compact && stageW >= 760 && stageW / stageH >= 1.1 ? 'spread' : 'single';

  let pageW: number;
  let pageH: number;
  if (mode === 'spread') {
    pageH = Math.min(stageH, (stageW / 2) * PAGE_RATIO, 1000);
    pageW = Math.min(stageW / 2, pageH / PAGE_RATIO);
  } else {
    pageW = Math.min(stageW, 620);
    pageH = Math.min(stageH, pageW * 1.72);
  }
  pageW = Math.floor(pageW);
  pageH = Math.floor(pageH);

  const fontSize = clamp(
    Math.round((pageW / 28) * textScale),
    Math.round(16 * textScale),
    Math.round(21 * textScale),
  );
  const leading = Math.round(fontSize * 1.6);
  const padX = clamp(Math.round(pageW * 0.1), 22, 68);
  const padTop = clamp(Math.round(pageH * 0.08), 34, 72);
  const padBottom = clamp(Math.round(pageH * 0.085), 40, 76);
  const flowW = pageW - padX * 2;
  const lines = Math.max(4, Math.floor((pageH - padTop - padBottom) / leading));

  return {
    mode,
    pageW,
    pageH,
    padX,
    padTop,
    padBottom,
    flowW,
    flowH: lines * leading,
    gap: padX * 2,
    fontSize,
    leading,
    barTop,
    barBottom,
  };
}

/** True when two layouts would paginate a text identically. */
export function sameFlow(a: BookLayout, b: BookLayout): boolean {
  return (
    a.mode === b.mode && a.flowW === b.flowW && a.flowH === b.flowH && a.fontSize === b.fontSize
  );
}

export function layoutVars(layout: BookLayout): Record<string, string> {
  const px = (n: number) => `${n}px`;
  return {
    '--page-w': px(layout.pageW),
    '--page-h': px(layout.pageH),
    '--book-w': px(layout.mode === 'spread' ? layout.pageW * 2 : layout.pageW),
    '--pad-x': px(layout.padX),
    '--pad-top': px(layout.padTop),
    '--pad-bottom': px(layout.padBottom),
    '--flow-w': px(layout.flowW),
    '--flow-h': px(layout.flowH),
    '--flow-gap': px(layout.gap),
    '--reader-font': px(layout.fontSize),
    '--reader-leading': px(layout.leading),
    '--bar-top': px(layout.barTop),
    '--bar-bottom': px(layout.barBottom),
  };
}
