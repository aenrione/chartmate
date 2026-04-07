import {NOTES, createFretboardModel, noteAtPosition} from '../lib/musicTheory';
import type {
  QuestionGenerator,
  AnswerValidator,
  DrillConfig,
  OctaveMapperQuestion,
  DrillQuestion,
  PositionWeight,
} from './types';
import {buildFretPositionPool, pickWeightedPosition, nextQuestionId} from './common';

export const octaveMapperGenerator: QuestionGenerator = {
  generate(config: DrillConfig, weights?: PositionWeight[]): OctaveMapperQuestion {
    const pool = buildFretPositionPool(config.stringRange, config.fretRange);
    const sourcePosition = pickWeightedPosition(pool, weights);
    const sourceNote = noteAtPosition(sourcePosition.string, sourcePosition.fret);

    const fretboard = createFretboardModel();
    // Find all octave positions (same note, different position)
    const allPositions = fretboard.positionsFor(sourceNote).filter(
      p =>
        (p.string !== sourcePosition.string || p.fret !== sourcePosition.fret) &&
        p.string >= config.stringRange[0] &&
        p.string <= config.stringRange[1] &&
        p.fret >= config.fretRange[0] &&
        p.fret <= config.fretRange[1],
    );

    return {
      type: 'octave-mapper',
      id: nextQuestionId(),
      sourcePosition,
      sourceNote,
      octavePositions: allPositions,
      correctAnswer: sourceNote,
    };
  },

  getAnswerOptions(): string[] {
    return [...NOTES];
  },

  getHint(question: DrillQuestion): string {
    if (question.type !== 'octave-mapper') return '';
    return `The source note is ${question.sourceNote}. Find all other ${question.sourceNote} notes on the fretboard.`;
  },
};

export const octaveMapperValidator: AnswerValidator = {
  validate(question: DrillQuestion, answer: string): boolean {
    if (question.type !== 'octave-mapper') return false;
    try {
      const pos = JSON.parse(answer);
      return question.octavePositions.some(
        p => p.string === pos.string && p.fret === pos.fret,
      );
    } catch {
      return false;
    }
  },
};
