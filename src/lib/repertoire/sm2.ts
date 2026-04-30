// SM-2 spaced repetition. Learning phase (rep=0): Again/Hard requeue in-session; Good→1d, Easy→4d.
// Review phase (rep>0): standard SM-2 intervals.

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
  let newEF = easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  newEF = Math.max(1.3, newEF);

  let newRepetitions: number;
  let newInterval: number;

  if (quality < 3) {
    // Failed review card — reset to learning
    newRepetitions = 0;
    newInterval = 1;
  } else if (repetitions === 0) {
    // Graduating from learning phase
    newRepetitions = 1;
    newInterval = quality === 5 ? 4 : 1; // Easy → 4d, Good → 1d
  } else if (repetitions === 1) {
    newRepetitions = 2;
    newInterval = 6;
  } else {
    newRepetitions = repetitions + 1;
    newInterval = Math.round(interval * newEF);
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

export function isLearningCard(repetitions: number): boolean {
  return repetitions === 0;
}

// Short interval labels for the confidence buttons (learning uses sub-day steps; review uses days).
export function previewButtonLabel(
  quality: ReviewQuality,
  repetitions: number,
  easeFactor: number,
  interval: number,
): string {
  if (repetitions === 0) {
    if (quality === 1) return '<1m';
    if (quality === 3) return '~10m';
    if (quality === 4) return '1d';
    return '4d';
  }
  const days = calculateSM2(quality, repetitions, easeFactor, interval).newInterval;
  if (days === 0) return 'now';
  if (days === 1) return '1d';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

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
