// src/pages/guitar/ear/exercises/__tests__/chordRecognition.test.ts
import {describe, it, expect} from 'vitest';
import {chordRecognition} from '../chordRecognition';
import {DEFAULT_EAR_CONFIG} from '../types';

describe('chordRecognition', () => {
  it('generates a chord question', () => {
    const q = chordRecognition.generate(DEFAULT_EAR_CONFIG);
    expect(q.type).toBe('chord-recognition');
    expect(chordRecognition.allOptions).toContain(q.correctAnswer);
  });

  it('validates correct answer', () => {
    const q = chordRecognition.generate(DEFAULT_EAR_CONFIG);
    expect(chordRecognition.validate(q, q.correctAnswer)).toBe(true);
  });

  it('validates incorrect answer', () => {
    const q = chordRecognition.generate({...DEFAULT_EAR_CONFIG, scope: ['Major']});
    expect(chordRecognition.validate(q, 'Minor')).toBe(false);
  });

  it('generates notes array for the chord', () => {
    const q = chordRecognition.generate({...DEFAULT_EAR_CONFIG, scope: ['Major'], fixedRoot: true});
    expect((q as any).notes.length).toBeGreaterThan(0);
  });
});
