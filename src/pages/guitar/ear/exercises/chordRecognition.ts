// src/pages/guitar/ear/exercises/chordRecognition.ts
import {audioEngine} from '@/lib/audio-engine';
import {pickRandom, nextQuestionId, pickWeightedItem} from './common';
import {registerExercise} from './registry';
import type {ExerciseDescriptor, EarConfig, EarQuestion, ChordQuestion, ItemWeight} from './types';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const TOTAL = 12;

const CHORD_DEFS: Record<string, number[]> = {
  'Major':       [0, 4, 7],
  'Minor':       [0, 3, 7],
  'Dominant 7':  [0, 4, 7, 10],
  'Major 7':     [0, 4, 7, 11],
  'Minor 7':     [0, 3, 7, 10],
  'Diminished':  [0, 3, 6],
  'Augmented':   [0, 4, 8],
  'Sus2':        [0, 2, 7],
  'Sus4':        [0, 5, 7],
};

const ALL_OPTIONS = Object.keys(CHORD_DEFS);

function buildChord(root: string, intervals: number[]): string[] {
  const idx = NOTES.indexOf(root as any);
  return intervals.map(i => NOTES[((idx + i) % TOTAL + TOTAL) % TOTAL]);
}

export const chordRecognition: ExerciseDescriptor = {
  type: 'chord-recognition',
  name: 'Chord Recognition',
  description: 'Hear a chord and identify its type.',
  icon: 'Music2',
  difficulty: 'intermediate',
  allOptions: ALL_OPTIONS,

  generate(config: EarConfig, weights?: ItemWeight[]): ChordQuestion {
    const activeOptions = config.scope.length > 0 ? config.scope : ALL_OPTIONS;
    const chordType = pickWeightedItem(activeOptions, weights ?? []);
    const rootNote = config.fixedRoot ? 'C' : pickRandom(NOTES);
    const notes = buildChord(rootNote, CHORD_DEFS[chordType]);
    return {type: 'chord-recognition', id: nextQuestionId(), rootNote, chordType, notes, correctAnswer: chordType};
  },

  validate(question: EarQuestion, answer: string): boolean {
    return (question as ChordQuestion).correctAnswer === answer;
  },

  async play(question: EarQuestion, config: EarConfig): Promise<void> {
    const q = question as ChordQuestion;
    await audioEngine.playChord(q.notes, 3, config.speed);
  },

  getHint(question: EarQuestion): string {
    const q = question as ChordQuestion;
    const intervals = CHORD_DEFS[q.chordType];
    return `${intervals.length} notes — intervals: ${intervals.join(', ')} semitones from root`;
  },

  getPromptItem(question: EarQuestion): string {
    return (question as ChordQuestion).correctAnswer;
  },

  getAnswerContext(_: EarQuestion): string | null { return null; },
};

registerExercise(chordRecognition);
