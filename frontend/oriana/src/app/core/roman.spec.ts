import { toRoman } from './roman';

describe('toRoman', () => {
  it('writes volume and chapter numerals', () => {
    expect([1, 2, 3, 4, 9, 14, 40, 90, 400].map(toRoman)).toEqual([
      'I', 'II', 'III', 'IV', 'IX', 'XIV', 'XL', 'XC', 'CD',
    ]);
  });

  it('writes years', () => {
    expect(toRoman(2026)).toBe('MMXXVI');
  });

  it('falls back to digits outside the classical range', () => {
    expect(toRoman(0)).toBe('0');
    expect(toRoman(4000)).toBe('4000');
  });
});
