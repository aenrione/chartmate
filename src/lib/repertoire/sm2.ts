/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Based on SuperMemo 2 algorithm by Piotr Wozniak.
 * Quality scale:
 *   0 — complete blackout
 *   1 — incorrect response (severe hint required)
 *   2 — incorrect response (easy hint)
 *   3 — correct but significant difficulty
 *   4 — correct with some hesitation
 *   5 — perfect response
 *
 * In UI we map: Again=1, Hard=3, Good=4, Easy=5
 */

export interface SM2Result {
  newInterval: number;
  newEaseFactor: number;
  newRepetitions: number;
  nextReviewDate: string; // 'YYYY-MM-DD'
}

export function calculateSM2(
  quality: number,
  repetitions: number,
  easeFactor: number,
  interval: number,
): SM2Result {
  // Update ease factor: EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  let newEF = easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  newEF = Math.max(1.3, newEF);

  let newRepetitions: number;
  let newInterval: number;

  if (quality < 3) {
    // Failed — start over
    newRepetitions = 0;
    newInterval = 1;
  } else {
    newRepetitions = repetitions + 1;
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEF);
    }
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);
  const nextReviewDate = nextDate.toISOString().split('T')[0];

  return {newInterval, newEaseFactor: newEF, newRepetitions, nextReviewDate};
}

/** Quality rating labels shown on review buttons */
export const QUALITY_LABELS: Record<number, string> = {
  1: 'Again',
  3: 'Hard',
  4: 'Good',
  5: 'Easy',
};

/** Quality values available as review options */
export const REVIEW_QUALITIES = [1, 3, 4, 5] as const;
export type ReviewQuality = (typeof REVIEW_QUALITIES)[number];

/** Preview next interval for a given quality without mutating state */
export function previewNextInterval(
  quality: ReviewQuality,
  repetitions: number,
  easeFactor: number,
  interval: number,
): number {
  return calculateSM2(quality, repetitions, easeFactor, interval).newInterval;
}

/** Format interval in human-friendly form */
export function formatInterval(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days === 7) return '1 week';
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

/** Today's date as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
