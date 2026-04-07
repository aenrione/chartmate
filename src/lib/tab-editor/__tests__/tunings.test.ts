import {describe, it, expect} from 'vitest';
import {getTuningsForInstrument, getDefaultTuningPreset, ALL_TUNINGS} from '../tunings';

describe('tunings', () => {
  it('has tunings for 6-string guitar', () => {
    const tunings = getTuningsForInstrument('guitar', 6);
    expect(tunings.length).toBeGreaterThan(0);
    expect(tunings[0].name).toContain('Standard');
    expect(tunings[0].values.length).toBe(6);
  });

  it('has tunings for 7-string guitar', () => {
    const tunings = getTuningsForInstrument('guitar', 7);
    expect(tunings.length).toBeGreaterThan(0);
    expect(tunings[0].values.length).toBe(7);
  });

  it('has tunings for 4-string bass', () => {
    const tunings = getTuningsForInstrument('bass', 4);
    expect(tunings.length).toBeGreaterThan(0);
    expect(tunings[0].values.length).toBe(4);
  });

  it('has tunings for 5-string bass', () => {
    const tunings = getTuningsForInstrument('bass', 5);
    expect(tunings.length).toBeGreaterThan(0);
    expect(tunings[0].values.length).toBe(5);
  });

  it('returns default tuning preset for guitar', () => {
    const preset = getDefaultTuningPreset('guitar', 6);
    expect(preset.name).toContain('Standard');
    expect(preset.values).toEqual([40, 45, 50, 55, 59, 64]);
  });

  it('returns default tuning preset for bass', () => {
    const preset = getDefaultTuningPreset('bass', 4);
    expect(preset.name).toContain('Standard');
    expect(preset.values).toEqual([28, 33, 38, 43]);
  });

  it('all tunings have valid MIDI values', () => {
    for (const t of ALL_TUNINGS) {
      for (const v of t.values) {
        expect(v).toBeGreaterThanOrEqual(20);
        expect(v).toBeLessThanOrEqual(80);
      }
    }
  });

  it('all tunings values length matches stringCount', () => {
    for (const t of ALL_TUNINGS) {
      expect(t.values.length).toBe(t.stringCount);
    }
  });
});
