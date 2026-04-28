/**
 * Star rules per activity type. Pure.
 *
 * Lessons (the only activity gamified through this function in step 1):
 *   1★ — completed
 *   2★ — completed with 0 hearts lost
 *   3★ — completed with 0 hearts lost AND first-try accuracy >= 0.85
 *
 * Lessons with no scored activities (pure-theory cards) pass `accuracy = 1.0`, so getting through
 * with 3 hearts intact yields 3★ as expected.
 */

export const ACCURACY_FOR_THIRD_STAR = 0.85;

export type Stars = 1 | 2 | 3;

export interface LessonStarInput {
  heartsLost: number;
  accuracy: number; // 0..1
}

export function computeLessonStars({heartsLost, accuracy}: LessonStarInput): Stars {
  if (heartsLost === 0 && accuracy >= ACCURACY_FOR_THIRD_STAR) return 3;
  if (heartsLost === 0) return 2;
  return 1;
}

/**
 * Stars are upgrade-only. Given a previous best and a newly-computed value, return the value to
 * persist. The engine uses this so a sloppy retry never erases prior mastery.
 */
export function upgradeStars(previous: Stars | null, computed: Stars): Stars {
  if (previous == null) return computed;
  return Math.max(previous, computed) as Stars;
}
