// src/pages/guitar/ear/exercises/__tests__/perfectPitch.test.ts
import {describe, it, expect} from 'vitest';
import {perfectPitch} from '../perfectPitch';
import {DEFAULT_EAR_CONFIG} from '../types';

describe('perfectPitch', () => {
  it('generates a question with a valid note', () => {
    const q = perfectPitch.generate(DEFAULT_EAR_CONFIG);
    expect(q.type).toBe('perfect-pitch');
    expect(perfectPitch.allOptions).toContain(q.correctAnswer);
  });

  it('validates correct answer', () => {
    const q = perfectPitch.generate(DEFAULT_EAR_CONFIG);
    expect(perfectPitch.validate(q, q.correctAnswer)).toBe(true);
  });

  it('rejects wrong answer', () => {
    const q = perfectPitch.generate({...DEFAULT_EAR_CONFIG, fixedRoot: true}); // C
    expect(perfectPitch.validate(q, 'D')).toBe(false);
  });
});
