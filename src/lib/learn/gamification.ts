export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function prevDayIso(dateIso: string): string {
  const d = new Date(dateIso);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
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
