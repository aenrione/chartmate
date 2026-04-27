import {vi, describe, it, expect, beforeEach, afterEach} from 'vitest';
import {todayIso, shouldIncrementStreak, shouldResetStreak} from '../gamification';

describe('todayIso', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns local calendar date in YYYY-MM-DD format', () => {
    vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the correct local date', () => {
    // Midday UTC so local date matches UTC date in any timezone
    vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
    expect(todayIso()).toBe('2026-04-26');
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
  it('returns true across month boundary (2026-04-30 → 2026-05-01)', () => {
    expect(shouldIncrementStreak('2026-04-30', '2026-05-01')).toBe(true);
  });
  it('returns true across year boundary (2025-12-31 → 2026-01-01)', () => {
    expect(shouldIncrementStreak('2025-12-31', '2026-01-01')).toBe(true);
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
  it('returns false across month boundary (consecutive days)', () => {
    expect(shouldResetStreak('2026-04-30', '2026-05-01')).toBe(false);
  });
  it('returns true across year boundary gap (2025-12-30 → 2026-01-01)', () => {
    expect(shouldResetStreak('2025-12-30', '2026-01-01')).toBe(true);
  });
});
