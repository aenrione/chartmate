import {describe, it, expect, beforeEach, vi} from 'vitest';

// Node 26 ships a localStorage global that is inert without --localstorage-file, and it wins
// over the jsdom one. Stub it, same as src/lib/__tests__/soundfont-store.test.ts does.
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
});

import {
  getUnlockedUnits,
  isUnitUnlocked,
  unlockUnit,
  relockUnit,
  subscribeUnlockedUnits,
  resetUnlockedUnitsCache,
} from '../unlocked-units';

const KEY = 'chartmate.learn.unlockedUnits';

beforeEach(() => {
  window.localStorage.clear();
  resetUnlockedUnitsCache();
});

describe('unlocked units store', () => {
  it('starts empty', () => {
    expect([...getUnlockedUnits()]).toEqual([]);
    expect(isUnitUnlocked('cg-01-cimientos')).toBe(false);
  });

  it('unlocks a unit and persists it', () => {
    unlockUnit('cg-04-tremolo');
    expect(isUnitUnlocked('cg-04-tremolo')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(['cg-04-tremolo']);
  });

  it('relocks a unit', () => {
    unlockUnit('cg-04-tremolo');
    relockUnit('cg-04-tremolo');
    expect(isUnitUnlocked('cg-04-tremolo')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual([]);
  });

  it('reads an existing localStorage value on first access', () => {
    window.localStorage.setItem(KEY, JSON.stringify(['cg-02-apoyando-y-escalas']));
    resetUnlockedUnitsCache();
    expect(isUnitUnlocked('cg-02-apoyando-y-escalas')).toBe(true);
  });

  it('survives junk in localStorage', () => {
    window.localStorage.setItem(KEY, 'not json');
    resetUnlockedUnitsCache();
    expect([...getUnlockedUnits()]).toEqual([]);

    window.localStorage.setItem(KEY, JSON.stringify({not: 'an array'}));
    resetUnlockedUnitsCache();
    expect([...getUnlockedUnits()]).toEqual([]);

    window.localStorage.setItem(KEY, JSON.stringify(['ok', 42, null]));
    resetUnlockedUnitsCache();
    expect([...getUnlockedUnits()]).toEqual(['ok']);
  });

  it('gives a new Set identity on every write, so snapshot comparison re-renders', () => {
    const before = getUnlockedUnits();
    unlockUnit('cg-01-cimientos');
    expect(getUnlockedUnits()).not.toBe(before);
  });

  it('keeps the same identity when the write is a no-op', () => {
    unlockUnit('cg-01-cimientos');
    const after = getUnlockedUnits();
    unlockUnit('cg-01-cimientos');
    relockUnit('cg-05-rutina');
    expect(getUnlockedUnits()).toBe(after);
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const fn = vi.fn();
    const off = subscribeUnlockedUnits(fn);
    unlockUnit('cg-01-cimientos');
    expect(fn).toHaveBeenCalledTimes(1);
    relockUnit('cg-01-cimientos');
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    unlockUnit('cg-01-cimientos');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
