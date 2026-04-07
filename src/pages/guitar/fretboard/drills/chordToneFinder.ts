import {
  NOTES,
  CHORD_TYPES,
  CHORD_TONE_LABELS,
  createFretboardModel,
  getChordNotes,
  areEnharmonic,
  noteAtPosition,
} from '../lib/musicTheory';
import type {
  QuestionGenerator,
  AnswerValidator,
  DrillConfig,
  ChordToneFinderQuestion,
  DrillQuestion,
  PositionWeight,
} from './types';
import {pickRandom, nextQuestionId} from './common';

const CHORD_TYPE_NAMES = Object.keys(CHORD_TYPES);

export const chordToneFinderGenerator: QuestionGenerator = {
  generate(config: DrillConfig): ChordToneFinderQuestion {
    const chordRoot = pickRandom(NOTES);
    const chordType = pickRandom(CHORD_TYPE_NAMES);
    const chordNotes = getChordNotes(chordRoot, chordType);

    // Pick which tone to find (0=Root, 1=3rd, 2=5th, etc.)
    const toneIndex = Math.floor(Math.random() * chordNotes.length);
    const targetNote = chordNotes[toneIndex];
    const targetTone = CHORD_TONE_LABELS[toneIndex] ?? `${toneIndex + 1}th`;

    const fretboard = createFretboardModel();
    const validPositions = fretboard.positionsFor(targetNote).filter(
      p =>
        p.string >= config.stringRange[0] &&
        p.string <= config.stringRange[1] &&
        p.fret >= config.fretRange[0] &&
        p.fret <= config.fretRange[1],
    );

    return {
      type: 'chord-tone-finder',
      id: nextQuestionId(),
      chordRoot,
      chordType,
      targetTone,
      validPositions,
      correctAnswer: targetNote,
    };
  },

  getAnswerOptions(): string[] {
    return [...NOTES];
  },

  getHint(question: DrillQuestion): string {
    if (question.type !== 'chord-tone-finder') return '';
    const chordNotes = getChordNotes(question.chordRoot, question.chordType);
    return `${question.chordRoot} ${question.chordType}: ${chordNotes.join(' - ')}`;
  },
};

export const chordToneFinderValidator: AnswerValidator = {
  validate(question: DrillQuestion, answer: string): boolean {
    if (question.type !== 'chord-tone-finder') return false;
    // Answer can be a clicked position (JSON) or a note name
    try {
      const pos = JSON.parse(answer);
      return question.validPositions.some(
        p => p.string === pos.string && p.fret === pos.fret,
      );
    } catch {
      return areEnharmonic(answer, question.correctAnswer);
    }
  },
};
