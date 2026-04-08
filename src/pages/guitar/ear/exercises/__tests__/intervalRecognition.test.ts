// src/pages/guitar/ear/exercises/__tests__/intervalRecognition.test.ts
import {describe, it, expect} from 'vitest';
import {intervalRecognition} from '../intervalRecognition';
import {DEFAULT_EAR_CONFIG} from '../types';

describe('intervalRecognition', () => {
  it('generates a question with a valid interval', () => {
    const q = intervalRecognition.generate(DEFAULT_EAR_CONFIG);
    expect(q.type).toBe('interval-recognition');
    expect(intervalRecognition.allOptions).toContain(q.correctAnswer);
  });

  it('validates correct answer', () => {
    const q = intervalRecognition.generate(DEFAULT_EAR_CONFIG);
    expect(intervalRecognition.validate(q, q.correctAnswer)).toBe(true);
  });

  it('validates incorrect answer', () => {
    const q = intervalRecognition.generate({...DEFAULT_EAR_CONFIG, scope: ['P5']});
    const wrong = 'm2';
    expect(intervalRecognition.validate(q, wrong)).toBe(false);
  });

  it('respects scope — only generates intervals in scope', () => {
    const scope = ['m2', 'M2'];
    for (let i = 0; i < 20; i++) {
      const q = intervalRecognition.generate({...DEFAULT_EAR_CONFIG, scope});
      expect(scope).toContain(q.correctAnswer);
    }
  });

  it('getPromptItem returns the correct interval', () => {
    const q = intervalRecognition.generate(DEFAULT_EAR_CONFIG);
    expect(intervalRecognition.getPromptItem(q)).toBe(q.correctAnswer);
  });
});
