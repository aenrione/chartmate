// src/pages/guitar/ear/exercises/scaleRecognition.ts
import {audioEngine} from '@/lib/audio-engine';
import {pickRandom, nextQuestionId, pickWeightedItem} from './common';
import {registerExercise} from './registry';
import type {ExerciseDescriptor, EarConfig, EarQuestion, ScaleQuestion, ItemWeight} from './types';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const TOTAL = 12;

const SCALE_DEFS: Record<string, number[]> = {
  'Major':           [0, 2, 4, 5, 7, 9, 11],
  'Natural Minor':   [0, 2, 3, 5, 7, 8, 10],
  'Pentatonic Major':[0, 2, 4, 7, 9],
  'Pentatonic Minor':[0, 3, 5, 7, 10],
  'Blues':           [0, 3, 5, 6, 7, 10],
  'Dorian':          [0, 2, 3, 5, 7, 9, 10],
  'Mixolydian':      [0, 2, 4, 5, 7, 9, 10],
  'Phrygian':        [0, 1, 3, 5, 7, 8, 10],
  'Lydian':          [0, 2, 4, 6, 7, 9, 11],
  'Locrian':         [0, 1, 3, 5, 6, 8, 10],
  'Harmonic Minor':  [0, 2, 3, 5, 7, 8, 11],
};

const ALL_OPTIONS = Object.keys(SCALE_DEFS);

function buildScale(root: string, intervals: number[]): string[] {
  const idx = NOTES.indexOf(root as any);
  return intervals.map(i => NOTES[((idx + i) % TOTAL + TOTAL) % TOTAL]);
}

export const scaleRecognition: ExerciseDescriptor = {
  type: 'scale-recognition',
  name: 'Scale Recognition',
  description: 'Hear a scale and identify its name.',
  icon: 'TrendingUp',
  difficulty: 'intermediate',
  allOptions: ALL_OPTIONS,

  generate(config: EarConfig, weights?: ItemWeight[]): ScaleQuestion {
    const activeOptions = config.scope.length > 0 ? config.scope : ALL_OPTIONS;
    const scaleName = pickWeightedItem(activeOptions, weights ?? []);
    const rootNote = config.fixedRoot ? 'C' : pickRandom(NOTES);
    const notes = buildScale(rootNote, SCALE_DEFS[scaleName]);
    return {type: 'scale-recognition', id: nextQuestionId(), rootNote, scaleName, notes, correctAnswer: scaleName};
  },

  validate(question: EarQuestion, answer: string): boolean {
    return (question as ScaleQuestion).correctAnswer === answer;
  },

  async play(question: EarQuestion, config: EarConfig): Promise<void> {
    const q = question as ScaleQuestion;
    await audioEngine.playSequence(q.notes, config.speed);
  },

  getHint(question: EarQuestion): string {
    const q = question as ScaleQuestion;
    const intervals = SCALE_DEFS[q.scaleName];
    return `${intervals.length}-note scale — step pattern: ${intervals.map((v, i) => i === 0 ? v : v - intervals[i-1]).join('-')}`;
  },

  getPromptItem(q: EarQuestion): string { return (q as ScaleQuestion).correctAnswer; },
  getAnswerContext(_: EarQuestion): string | null { return null; },
};

registerExercise(scaleRecognition);
