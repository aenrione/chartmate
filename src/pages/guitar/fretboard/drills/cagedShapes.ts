import {NOTES, CAGED_SHAPES, type CAGEDShape, type NoteName} from '../lib/musicTheory';
import type {
  QuestionGenerator,
  AnswerValidator,
  DrillConfig,
  CAGEDShapesQuestion,
  DrillQuestion,
} from './types';
import {pickRandom, nextQuestionId} from './common';
import type {FretPosition} from '../lib/musicTheory';

// Simplified CAGED shape position patterns (relative fret offsets from root)
// These represent the characteristic fingering patterns for each shape
const CAGED_PATTERNS: Record<CAGEDShape, Array<{stringOffset: number; fretOffset: number}>> = {
  C: [
    {stringOffset: 0, fretOffset: 0},
    {stringOffset: 1, fretOffset: 1},
    {stringOffset: 2, fretOffset: 0},
    {stringOffset: 3, fretOffset: 2},
    {stringOffset: 4, fretOffset: 3},
  ],
  A: [
    {stringOffset: 0, fretOffset: 0},
    {stringOffset: 1, fretOffset: 2},
    {stringOffset: 2, fretOffset: 2},
    {stringOffset: 3, fretOffset: 2},
    {stringOffset: 4, fretOffset: 0},
  ],
  G: [
    {stringOffset: 0, fretOffset: 3},
    {stringOffset: 1, fretOffset: 0},
    {stringOffset: 2, fretOffset: 0},
    {stringOffset: 3, fretOffset: 0},
    {stringOffset: 4, fretOffset: 2},
  ],
  E: [
    {stringOffset: 0, fretOffset: 0},
    {stringOffset: 1, fretOffset: 0},
    {stringOffset: 2, fretOffset: 1},
    {stringOffset: 3, fretOffset: 2},
    {stringOffset: 4, fretOffset: 2},
  ],
  D: [
    {stringOffset: 0, fretOffset: 2},
    {stringOffset: 1, fretOffset: 3},
    {stringOffset: 2, fretOffset: 2},
    {stringOffset: 3, fretOffset: 0},
  ],
};

function getShapePositions(root: NoteName, shape: CAGEDShape, baseFret: number): FretPosition[] {
  const pattern = CAGED_PATTERNS[shape];
  return pattern.map(p => ({
    string: p.stringOffset + 1, // Start from A string typically
    fret: baseFret + p.fretOffset,
  })).filter(p => p.fret >= 0 && p.fret <= 22 && p.string >= 0 && p.string <= 5);
}

export const cagedShapesGenerator: QuestionGenerator = {
  generate(config: DrillConfig): CAGEDShapesQuestion {
    const chordRoot = pickRandom(NOTES);
    const correctShape = pickRandom(CAGED_SHAPES);

    // Calculate base fret position from the chord root and shape
    const baseFret = Math.max(config.fretRange[0], Math.floor(Math.random() * 10) + 1);
    const shapePositions = getShapePositions(chordRoot, correctShape, baseFret);

    return {
      type: 'caged-shapes',
      id: nextQuestionId(),
      chordRoot,
      shapePositions,
      correctAnswer: correctShape,
    };
  },

  getAnswerOptions(): string[] {
    return [...CAGED_SHAPES];
  },

  getHint(question: DrillQuestion): string {
    if (question.type !== 'caged-shapes') return '';
    return `Look at the shape of the chord voicing. Which open chord does it resemble?`;
  },
};

export const cagedShapesValidator: AnswerValidator = {
  validate(question: DrillQuestion, answer: string): boolean {
    if (question.type !== 'caged-shapes') return false;
    return answer === question.correctAnswer;
  },
};
