// Units the learner chose to open even though their prerequisites are not met.
//
// This is a per-device UI preference, not progress: it says "let me in", not "I finished this".
// It lives in localStorage rather than the DB because getUnitStatus() reads it synchronously
// while rendering the skill tree, and because an override on one machine shouldn't follow the
// learner's progress around.
//
// Unlocking a unit never cascades. Opening "cg-02" by hand does not satisfy "cg-02" as a
// prerequisite of "cg-03" — only actually completing its lessons does.

import {useSyncExternalStore} from 'react';

const KEY = 'chartmate.learn.unlockedUnits';

let snapshot: Set<string> | null = null;
const listeners = new Set<() => void>();

function read(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function write(next: Set<string>) {
  snapshot = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // Ignore localStorage errors — the override still holds for this session.
  }
  listeners.forEach(fn => fn());
}

/** The current override set. Stable identity between writes, so it is safe as a store snapshot. */
export function getUnlockedUnits(): Set<string> {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

export function isUnitUnlocked(unitId: string): boolean {
  return getUnlockedUnits().has(unitId);
}

export function unlockUnit(unitId: string) {
  const current = getUnlockedUnits();
  if (current.has(unitId)) return;
  write(new Set(current).add(unitId));
}

export function relockUnit(unitId: string) {
  const current = getUnlockedUnits();
  if (!current.has(unitId)) return;
  const next = new Set(current);
  next.delete(unitId);
  write(next);
}

export function subscribeUnlockedUnits(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test seam: drop the cached snapshot so the next read hits localStorage again. */
export function resetUnlockedUnitsCache() {
  snapshot = null;
}

/** Re-renders the caller whenever an override is added or removed. */
export function useUnlockedUnits(): Set<string> {
  return useSyncExternalStore(subscribeUnlockedUnits, getUnlockedUnits, getUnlockedUnits);
}
