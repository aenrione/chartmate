// src/pages/guitar/ear/exercises/__tests__/melodicDictation.test.ts
import {describe, it, expect} from 'vitest';
import {melodicDictation} from '../melodicDictation';
import {DEFAULT_EAR_CONFIG} from '../types';

describe('melodicDictation', () => {
  it('generates a melodic dictation question', () => {
    const q = melodicDictation.generate(DEFAULT_EAR_CONFIG);
    expect(q.type).toBe('melodic-dictation');
  });

  it('generates 3-5 notes', () => {
    const q = melodicDictation.generate(DEFAULT_EAR_CONFIG);
    const mq = q as any;
    expect(mq.notes.length).toBeGreaterThanOrEqual(3);
    expect(mq.notes.length).toBeLessThanOrEqual(5);
  });

  it('validates correct answer', () => {
    const q = melodicDictation.generate(DEFAULT_EAR_CONFIG);
    expect(melodicDictation.validate(q, q.correctAnswer)).toBe(true);
  });
});
