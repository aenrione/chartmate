// src/pages/guitar/ear/exercises/__tests__/scaleDegrees.test.ts
import {describe, it, expect} from 'vitest';
import {scaleDegrees} from '../scaleDegrees';
import {DEFAULT_EAR_CONFIG} from '../types';

describe('scaleDegrees', () => {
  it('generates a scale degree question', () => {
    const q = scaleDegrees.generate(DEFAULT_EAR_CONFIG);
    expect(q.type).toBe('scale-degrees');
    expect(scaleDegrees.allOptions).toContain(q.correctAnswer);
  });

  it('validates correct answer', () => {
    const q = scaleDegrees.generate(DEFAULT_EAR_CONFIG);
    expect(scaleDegrees.validate(q, q.correctAnswer)).toBe(true);
  });

  it('getAnswerContext returns key info', () => {
    const q = scaleDegrees.generate(DEFAULT_EAR_CONFIG);
    const ctx = scaleDegrees.getAnswerContext(q);
    expect(ctx).not.toBeNull();
    const parsed = JSON.parse(ctx!);
    expect(parsed).toHaveProperty('key');
  });
});
