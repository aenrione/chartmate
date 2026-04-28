import {describe, expect, it} from 'vitest';
import {ACHIEVEMENT_CATALOG, MISSION_CATALOG, mondayOfWeek, recordEvent} from '..';

describe('mondayOfWeek', () => {
  it('returns the same date when given a Monday', () => {
    expect(mondayOfWeek('2026-04-27')).toBe('2026-04-27'); // 2026-04-27 is a Monday
  });

  it('rolls back to the prior Monday for a Tuesday-Sunday', () => {
    expect(mondayOfWeek('2026-04-28')).toBe('2026-04-27'); // Tue
    expect(mondayOfWeek('2026-04-29')).toBe('2026-04-27'); // Wed
    expect(mondayOfWeek('2026-04-30')).toBe('2026-04-27'); // Thu
    expect(mondayOfWeek('2026-05-01')).toBe('2026-04-27'); // Fri
    expect(mondayOfWeek('2026-05-02')).toBe('2026-04-27'); // Sat
    expect(mondayOfWeek('2026-05-03')).toBe('2026-04-27'); // Sun
  });

  it('rolls Sunday back six days to the previous Monday', () => {
    // 2026-01-04 was a Sunday. The Monday before is 2025-12-29.
    expect(mondayOfWeek('2026-01-04')).toBe('2025-12-29');
  });
});

describe('public engine API surface', () => {
  it('exports recordEvent and the catalogs', () => {
    expect(typeof recordEvent).toBe('function');
    expect(Array.isArray(ACHIEVEMENT_CATALOG)).toBe(true);
    expect(Array.isArray(MISSION_CATALOG)).toBe(true);
  });

  it('every achievement has unique id and a known tier', () => {
    const ids = ACHIEVEMENT_CATALOG.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENT_CATALOG) {
      expect(['bronze', 'silver', 'gold']).toContain(a.tier);
    }
  });
});
