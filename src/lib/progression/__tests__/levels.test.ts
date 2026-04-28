import {describe, expect, it} from 'vitest';
import {
  applyXpToLevels,
  cumXpAtLevelEnd,
  levelFromCumXp,
  xpIntoLevel,
  xpToNextLevel,
} from '../levels';

describe('cumXpAtLevelEnd', () => {
  it('returns 0 for level 0', () => {
    expect(cumXpAtLevelEnd(0)).toBe(0);
  });

  it('matches the documented curve 100 / 300 / 600 / 1000 / 1500', () => {
    expect(cumXpAtLevelEnd(1)).toBe(100);
    expect(cumXpAtLevelEnd(2)).toBe(300);
    expect(cumXpAtLevelEnd(3)).toBe(600);
    expect(cumXpAtLevelEnd(4)).toBe(1000);
    expect(cumXpAtLevelEnd(5)).toBe(1500);
  });
});

describe('levelFromCumXp', () => {
  it('returns level 1 at 0 XP', () => {
    expect(levelFromCumXp(0)).toBe(1);
  });

  it('stays at level 1 just below the threshold', () => {
    expect(levelFromCumXp(99)).toBe(1);
  });

  it('promotes to level 2 exactly at 100 XP', () => {
    expect(levelFromCumXp(100)).toBe(2);
  });

  it('respects level 2/3/4/5 boundaries', () => {
    expect(levelFromCumXp(299)).toBe(2);
    expect(levelFromCumXp(300)).toBe(3);
    expect(levelFromCumXp(599)).toBe(3);
    expect(levelFromCumXp(600)).toBe(4);
    expect(levelFromCumXp(999)).toBe(4);
    expect(levelFromCumXp(1000)).toBe(5);
  });
});

describe('xpIntoLevel and xpToNextLevel', () => {
  it('decompose cum XP cleanly within a level', () => {
    expect(xpIntoLevel(50)).toBe(50);
    expect(xpToNextLevel(50)).toBe(50);
    expect(xpIntoLevel(50) + xpToNextLevel(50)).toBe(100);
  });

  it('handles the moment of leveling up', () => {
    expect(xpIntoLevel(100)).toBe(0);
    expect(xpToNextLevel(100)).toBe(200);
  });

  it('handles deep mid-level state', () => {
    expect(xpIntoLevel(450)).toBe(150); // level 3 starts at 300
    expect(xpToNextLevel(450)).toBe(150);
  });
});

describe('applyXpToLevels', () => {
  it('grants XP without leveling up', () => {
    const result = applyXpToLevels({cum_xp: 50, level: 1}, 30);
    expect(result.cum_xp).toBe(80);
    expect(result.level).toBe(1);
    expect(result.leveledUp).toBe(false);
    expect(result.newLevel).toBeUndefined();
  });

  it('detects level-up and exposes the new level', () => {
    const result = applyXpToLevels({cum_xp: 50, level: 1}, 60);
    expect(result.cum_xp).toBe(110);
    expect(result.level).toBe(2);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);
    expect(result.prevLevel).toBe(1);
  });

  it('skips levels when given a huge XP grant', () => {
    const result = applyXpToLevels({cum_xp: 0, level: 1}, 700);
    expect(result.level).toBe(4);
    expect(result.leveledUp).toBe(true);
  });

  it('coerces negative or fractional XP to a safe integer', () => {
    const result = applyXpToLevels({cum_xp: 50, level: 1}, -5);
    expect(result.cum_xp).toBe(50);
    expect(result.leveledUp).toBe(false);

    const fractional = applyXpToLevels({cum_xp: 50, level: 1}, 12.7);
    expect(fractional.cum_xp).toBe(62);
  });
});
