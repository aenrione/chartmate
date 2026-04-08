// src/pages/guitar/ear/exercises/__tests__/scaleRecognition.test.ts
import {describe, it, expect} from 'vitest';
import {scaleRecognition} from '../scaleRecognition';
import {DEFAULT_EAR_CONFIG} from '../types';

describe('scaleRecognition', () => {
  it('generates a scale question', () => {
    const q = scaleRecognition.generate(DEFAULT_EAR_CONFIG);
    expect(q.type).toBe('scale-recognition');
    expect(scaleRecognition.allOptions).toContain(q.correctAnswer);
  });

  it('validates correct answer', () => {
    const q = scaleRecognition.generate(DEFAULT_EAR_CONFIG);
    expect(scaleRecognition.validate(q, q.correctAnswer)).toBe(true);
  });

  it('generates notes for the scale', () => {
    const q = scaleRecognition.generate({...DEFAULT_EAR_CONFIG, scope: ['Major']});
    expect((q as any).notes.length).toBe(7); // Major has 7 notes
  });
});
