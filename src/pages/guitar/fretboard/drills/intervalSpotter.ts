import {INTERVALS, noteAtPosition, semitonesBetween} from '../lib/musicTheory';
import type {QuestionGenerator, AnswerValidator, DrillConfig, IntervalSpotterQuestion, DrillQuestion, PositionWeight} from './types';
import {buildFretPositionPool, pickWeightedPosition, pickRandom, nextQuestionId} from './common';

export const intervalSpotterGenerator: QuestionGenerator = {
  generate(config: DrillConfig, weights?: PositionWeight[]): IntervalSpotterQuestion {
    const pool = buildFretPositionPool(config.stringRange, config.fretRange);
    const rootPosition = pickWeightedPosition(pool, weights);

    // Pick a different position for the target
    let targetPosition = pickRandom(pool);
    while (targetPosition.string === rootPosition.string && targetPosition.fret === rootPosition.fret) {
      targetPosition = pickRandom(pool);
    }

    const rootNote = noteAtPosition(rootPosition.string, rootPosition.fret);
    const targetNote = noteAtPosition(targetPosition.string, targetPosition.fret);
    const semitones = semitonesBetween(rootNote, targetNote);
    const interval = INTERVALS[semitones];

    return {
      type: 'interval-spotter',
      id: nextQuestionId(),
      rootPosition,
      targetPosition,
      correctAnswer: interval.short,
    };
  },

  getAnswerOptions(): string[] {
    return INTERVALS.slice(0, 13).map(i => i.short);
  },

  getHint(question: DrillQuestion): string {
    if (question.type !== 'interval-spotter') return '';
    const rootNote = noteAtPosition(question.rootPosition.string, question.rootPosition.fret);
    const targetNote = noteAtPosition(question.targetPosition.string, question.targetPosition.fret);
    return `Root note: ${rootNote}, Target note: ${targetNote}`;
  },
};

export const intervalSpotterValidator: AnswerValidator = {
  validate(question: DrillQuestion, answer: string): boolean {
    if (question.type !== 'interval-spotter') return false;
    return answer === question.correctAnswer;
  },
};
