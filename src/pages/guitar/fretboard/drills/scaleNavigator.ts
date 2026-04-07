import {
  NOTES,
  SCALES,
  createFretboardModel,
  getScaleNotes,
  noteAtPosition,
} from '../lib/musicTheory';
import type {
  QuestionGenerator,
  AnswerValidator,
  DrillConfig,
  ScaleNavigatorQuestion,
  DrillQuestion,
  PositionWeight,
} from './types';
import {pickRandom, nextQuestionId} from './common';

const SCALE_NAMES = Object.keys(SCALES);

export const scaleNavigatorGenerator: QuestionGenerator = {
  generate(config: DrillConfig): ScaleNavigatorQuestion {
    const rootNote = pickRandom(NOTES);
    const scaleName = pickRandom(SCALE_NAMES);
    const scaleNotes = getScaleNotes(rootNote, scaleName);
    const fretboard = createFretboardModel();

    // Find all scale positions within the config range
    const allScalePositions = scaleNotes.flatMap(note =>
      fretboard.positionsFor(note).filter(
        p =>
          p.string >= config.stringRange[0] &&
          p.string <= config.stringRange[1] &&
          p.fret >= config.fretRange[0] &&
          p.fret <= config.fretRange[1],
      ),
    );

    // Remove some positions for the user to fill in (30-50% of total)
    const removeCount = Math.max(2, Math.floor(allScalePositions.length * 0.4));
    const shuffled = [...allScalePositions].sort(() => Math.random() - 0.5);
    const positionsToFill = shuffled.slice(0, removeCount);

    return {
      type: 'scale-navigator',
      id: nextQuestionId(),
      rootNote,
      scaleName,
      positionsToFill,
      allScalePositions,
      correctAnswer: JSON.stringify(positionsToFill.sort((a, b) => a.string - b.string || a.fret - b.fret)),
    };
  },

  getAnswerOptions(): string[] {
    return [...NOTES];
  },

  getHint(question: DrillQuestion): string {
    if (question.type !== 'scale-navigator') return '';
    const notes = getScaleNotes(question.rootNote, question.scaleName);
    return `${question.rootNote} ${question.scaleName}: ${notes.join(' - ')}`;
  },
};

export const scaleNavigatorValidator: AnswerValidator = {
  validate(question: DrillQuestion, answer: string): boolean {
    if (question.type !== 'scale-navigator') return false;
    // For scale navigator, we validate individual positions clicked
    // The answer is a stringified position that should be in positionsToFill
    try {
      const pos = JSON.parse(answer);
      return question.allScalePositions.some(
        p => p.string === pos.string && p.fret === pos.fret,
      );
    } catch {
      return false;
    }
  },
};
