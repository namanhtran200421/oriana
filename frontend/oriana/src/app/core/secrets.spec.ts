import { normalise } from './secrets';

describe('normalise', () => {
  it('keeps letters only, in lower case', () => {
    expect(normalise('  Oriana! ')).toBe('oriana');
    expect(normalise('Nam Anh')).toBe('namanh');
  });

  it('takes the accents off, so Vietnamese spellings match', () => {
    expect(normalise('Nắm Ánh')).toBe('namanh');
    expect(normalise('Đèn')).toBe('den');
  });

  it('reads arrows as the arcade code spells them', () => {
    expect(normalise('↑↑↓↓←→←→ B A')).toBe('uuddlrlrba');
  });
});
