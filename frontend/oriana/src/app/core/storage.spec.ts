import { dayNumber, readStored, remembered, today, writeStored } from './storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('reads back what it wrote, and the fallback when nothing is there', () => {
    expect(readStored('oriana:test', 7)).toBe(7);
    writeStored('oriana:test', { a: 1 });
    expect(readStored('oriana:test', {})).toEqual({ a: 1 });
  });

  it('falls back gracefully on anything unreadable', () => {
    localStorage.setItem('oriana:test', '{not json');
    expect(readStored('oriana:test', 'fallback')).toBe('fallback');
  });

  it('starts a remembered value at its fallback until restored', () => {
    writeStored('oriana:test', { count: 3 });
    const value = remembered('oriana:test', { count: 0, extra: 'kept' });
    expect(value.value()).toEqual({ count: 0, extra: 'kept' });
    value.restore();
    // Fields the stored copy lacks keep their defaults.
    expect(value.value()).toEqual({ count: 3, extra: 'kept' });
  });

  it('restores before the first change, and remembers it', () => {
    writeStored('oriana:test', { count: 3 });
    const value = remembered('oriana:test', { count: 0 });
    value.update((v) => ({ count: v.count + 1 }));
    expect(value.value().count).toBe(4);
    expect(readStored('oriana:test', { count: 0 }).count).toBe(4);
  });

  it('writes days in the visitor’s own calendar', () => {
    expect(today(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(dayNumber(new Date(2026, 0, 1, 9))).toBe(0);
    expect(dayNumber(new Date(2026, 0, 2, 0, 1))).toBe(1);
    expect(dayNumber(new Date(2026, 2, 30, 12))).toBe(dayNumber(new Date(2026, 2, 29, 12)) + 1);
  });
});
