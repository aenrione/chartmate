import {NOTES, noteAtPosition, areEnharmonic} from '../lib/musicTheory';
import type {QuestionGenerator, AnswerValidator, DrillConfig, NoteFinderQuestion, DrillQuestion, PositionWeight} from './types';
import {buildFretPositionPool, pickWeightedPosition, nextQuestionId} from './common';

const NATURAL_NOTES = NOTES.filter(n => !n.includes('#') && !n.includes('b'));

export const noteFinderGenerator: QuestionGenerator = {
  generate(config: DrillConfig, weights?: PositionWeight[]): NoteFinderQuestion {
    const pool = buildFretPositionPool(config.stringRange, config.fretRange);
    const position = pickWeightedPosition(pool, weights);
    const correctAnswer = noteAtPosition(position.string, position.fret);

    return {
      type: 'note-finder',
      id: nextQuestionId(),
      position,
      correctAnswer,
    };
  },

  getAnswerOptions(): string[] {
    return [...NOTES];
  },

  getHint(question: DrillQuestion): string {
    if (question.type !== 'note-finder') return '';
    const {position} = question;
    const strings = ['E', 'B', 'G', 'D', 'A', 'E'];
    return `This note is on the ${strings[position.string]} string, fret ${position.fret}`;
  },
};

export const noteFinderValidator: AnswerValidator = {
  validate(question: DrillQuestion, answer: string): boolean {
    if (question.type !== 'note-finder') return false;
    return areEnharmonic(answer, question.correctAnswer);
  },
};
