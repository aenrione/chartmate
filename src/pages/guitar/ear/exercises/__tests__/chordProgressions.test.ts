// src/pages/guitar/ear/exercises/__tests__/chordProgressions.test.ts
import {describe, it, expect} from 'vitest';
import {chordProgressions} from '../chordProgressions';
import {DEFAULT_EAR_CONFIG} from '../types';

describe('chordProgressions', () => {
  it('generates a chord progression question', () => {
    const q = chordProgressions.generate(DEFAULT_EAR_CONFIG);
    expect(q.type).toBe('chord-progressions');
  });

  it('validates correct answer (JSON array)', () => {
    const q = chordProgressions.generate(DEFAULT_EAR_CONFIG);
    expect(chordProgressions.validate(q, q.correctAnswer)).toBe(true);
  });

  it('generates chordNotes for each chord in progression', () => {
    const q = chordProgressions.generate(DEFAULT_EAR_CONFIG);
    expect((q as any).chordNotes.length).toBeGreaterThan(1);
  });
});
