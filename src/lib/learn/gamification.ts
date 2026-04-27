export function todayIso(): string {
  return new Date().toLocaleDateString('sv'); // returns YYYY-MM-DD in local time
}

function prevDayIso(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

/**
 * Returns true if the streak counter should be incremented.
 * Happens when: no prior active date (first time), or last active was yesterday.
 */
export function shouldIncrementStreak(lastActiveDate: string | null, today: string): boolean {
  if (!lastActiveDate) return true;
  if (lastActiveDate === today) return false;
  return lastActiveDate === prevDayIso(today);
}

/**
 * Returns true if the streak should reset to 1 (gap of 2+ days).
 */
export function shouldResetStreak(lastActiveDate: string | null, today: string): boolean {
  if (!lastActiveDate) return false;
  if (lastActiveDate === today) return false;
  return lastActiveDate !== prevDayIso(today);
}
