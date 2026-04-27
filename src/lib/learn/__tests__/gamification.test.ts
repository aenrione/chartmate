import {describe, it, expect} from 'vitest';
import {todayIso, shouldIncrementStreak, shouldResetStreak} from '../gamification';

describe('todayIso', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = todayIso();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('shouldIncrementStreak', () => {
  it('returns true if no prior streak (first time)', () => {
    expect(shouldIncrementStreak(null, '2026-04-26')).toBe(true);
  });
  it('returns false if last active was today (already counted)', () => {
    expect(shouldIncrementStreak('2026-04-26', '2026-04-26')).toBe(false);
  });
  it('returns true if last active was yesterday (consecutive)', () => {
    expect(shouldIncrementStreak('2026-04-25', '2026-04-26')).toBe(true);
  });
  it('returns false if gap is 2+ days (should reset, not increment)', () => {
    expect(shouldIncrementStreak('2026-04-24', '2026-04-26')).toBe(false);
  });
});

describe('shouldResetStreak', () => {
  it('returns false if no prior streak', () => {
    expect(shouldResetStreak(null, '2026-04-26')).toBe(false);
  });
  it('returns false if last active was today', () => {
    expect(shouldResetStreak('2026-04-26', '2026-04-26')).toBe(false);
  });
  it('returns false if last active was yesterday (consecutive, no reset)', () => {
    expect(shouldResetStreak('2026-04-25', '2026-04-26')).toBe(false);
  });
  it('returns true if gap is 2+ days (missed at least one day)', () => {
    expect(shouldResetStreak('2026-04-24', '2026-04-26')).toBe(true);
  });
  it('returns true if gap is 10 days', () => {
    expect(shouldResetStreak('2026-04-16', '2026-04-26')).toBe(true);
  });
});
