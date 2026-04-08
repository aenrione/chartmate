// src/pages/guitar/ear/exercises/__tests__/intervalsInContext.test.ts
import {describe, it, expect} from 'vitest';
import {intervalsInContext} from '../intervalsInContext';
import {DEFAULT_EAR_CONFIG} from '../types';

describe('intervalsInContext', () => {
  it('generates a question', () => {
    const q = intervalsInContext.generate(DEFAULT_EAR_CONFIG);
    expect(q.type).toBe('intervals-in-context');
    expect(intervalsInContext.allOptions).toContain(q.correctAnswer);
  });

  it('validates correct answer', () => {
    const q = intervalsInContext.generate(DEFAULT_EAR_CONFIG);
    expect(intervalsInContext.validate(q, q.correctAnswer)).toBe(true);
  });

  it('getAnswerContext returns key info', () => {
    const q = intervalsInContext.generate(DEFAULT_EAR_CONFIG);
    const ctx = intervalsInContext.getAnswerContext(q);
    expect(JSON.parse(ctx!)).toHaveProperty('key');
  });
});
