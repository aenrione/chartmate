import {describe, expect, it} from 'vitest';
import {ACCURACY_FOR_THIRD_STAR, computeLessonStars, upgradeStars} from '../stars';

describe('computeLessonStars', () => {
  it('returns 1 when hearts were lost regardless of accuracy', () => {
    expect(computeLessonStars({heartsLost: 1, accuracy: 1})).toBe(1);
    expect(computeLessonStars({heartsLost: 3, accuracy: 0.5})).toBe(1);
  });

  it('returns 2 when no hearts lost but accuracy below the third-star threshold', () => {
    expect(computeLessonStars({heartsLost: 0, accuracy: ACCURACY_FOR_THIRD_STAR - 0.01})).toBe(2);
    expect(computeLessonStars({heartsLost: 0, accuracy: 0})).toBe(2);
  });

  it('returns 3 when no hearts lost AND accuracy at or above threshold', () => {
    expect(computeLessonStars({heartsLost: 0, accuracy: ACCURACY_FOR_THIRD_STAR})).toBe(3);
    expect(computeLessonStars({heartsLost: 0, accuracy: 1})).toBe(3);
  });

  it('treats lessons with no scored activities (accuracy=1) generously', () => {
    expect(computeLessonStars({heartsLost: 0, accuracy: 1})).toBe(3);
  });
});

describe('upgradeStars', () => {
  it('initializes from null', () => {
    expect(upgradeStars(null, 2)).toBe(2);
  });

  it('never downgrades', () => {
    expect(upgradeStars(3, 1)).toBe(3);
    expect(upgradeStars(3, 2)).toBe(3);
    expect(upgradeStars(2, 1)).toBe(2);
  });

  it('upgrades when the new computed value is higher', () => {
    expect(upgradeStars(1, 2)).toBe(2);
    expect(upgradeStars(1, 3)).toBe(3);
    expect(upgradeStars(2, 3)).toBe(3);
  });
});
