import { computeLayout, sameFlow } from './layout';

describe('computeLayout', () => {
  it('opens a two-page spread on a laptop', () => {
    const layout = computeLayout(1440, 900);
    expect(layout.mode).toBe('spread');
    expect(layout.pageW * 2).toBeLessThanOrEqual(1440);
  });

  it('shows a single page on a phone, comfortably sized', () => {
    const layout = computeLayout(390, 844);
    expect(layout.mode).toBe('single');
    expect(layout.fontSize).toBeGreaterThanOrEqual(16);
    expect(layout.pageW).toBeLessThanOrEqual(390);
  });

  it('keeps the text block a whole number of lines tall', () => {
    for (const [w, h] of [[1440, 900], [390, 844], [1024, 768], [800, 1200]]) {
      const layout = computeLayout(w, h);
      expect(layout.flowH % layout.leading).toBe(0);
      expect(layout.padTop + layout.flowH).toBeLessThanOrEqual(layout.pageH - layout.padBottom);
    }
  });

  it('knows when a resize would not change the pagination', () => {
    expect(sameFlow(computeLayout(1440, 900), computeLayout(1440, 900))).toBe(true);
    expect(sameFlow(computeLayout(1440, 900), computeLayout(390, 844))).toBe(false);
  });
});
