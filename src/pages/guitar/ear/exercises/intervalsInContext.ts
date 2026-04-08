// src/pages/guitar/ear/exercises/intervalsInContext.ts
import {audioEngine} from '@/lib/audio-engine';
import {pickRandom, nextQuestionId, pickWeightedItem, resolveDirection} from './common';
import {registerExercise} from './registry';
import type {ExerciseDescriptor, EarConfig, EarQuestion, IntervalInContextQuestion, ItemWeight} from './types';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const TOTAL = 12;
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

const INTERVAL_DEFS = [
  {short: 'm2', semitones: 1}, {short: 'M2', semitones: 2},
  {short: 'm3', semitones: 3}, {short: 'M3', semitones: 4},
  {short: 'P4', semitones: 5}, {short: 'TT', semitones: 6},
  {short: 'P5', semitones: 7}, {short: 'm6', semitones: 8},
  {short: 'M6', semitones: 9}, {short: 'm7', semitones: 10},
  {short: 'M7', semitones: 11}, {short: 'P8', semitones: 12},
];
const ALL_OPTIONS = INTERVAL_DEFS.map(i => i.short);

function transpose(root: string, semitones: number): string {
  const idx = NOTES.indexOf(root as any);
  return NOTES[((idx + semitones) % TOTAL + TOTAL) % TOTAL];
}

export const intervalsInContext: ExerciseDescriptor = {
  type: 'intervals-in-context',
  name: 'Intervals in Context',
  description: 'Identify intervals heard within an established key.',
  icon: 'ScanLine',
  difficulty: 'advanced',
  allOptions: ALL_OPTIONS,

  generate(config: EarConfig, weights?: ItemWeight[]): IntervalInContextQuestion {
    const key = config.fixedRoot ? 'C' : pickRandom(NOTES);
    // Root note is always a scale degree of the key
    const degreeOffset = pickRandom(MAJOR_INTERVALS);
    const rootNote = transpose(key, degreeOffset);
    const activeOptions = config.scope.length > 0 ? config.scope : ALL_OPTIONS;
    const chosen = pickWeightedItem(activeOptions, weights ?? []);
    const def = INTERVAL_DEFS.find(d => d.short === chosen)!;
    const targetNote = transpose(rootNote, def.semitones);
    const dir = resolveDirection(config.direction);
    return {
      type: 'intervals-in-context', id: nextQuestionId(),
      key, rootNote, targetNote, resolvedDirection: dir, correctAnswer: chosen,
    };
  },

  validate(question: EarQuestion, answer: string): boolean {
    return (question as IntervalInContextQuestion).correctAnswer === answer;
  },

  async play(question: EarQuestion, config: EarConfig): Promise<void> {
    const q = question as IntervalInContextQuestion;
    // Play tonic to establish key
    await audioEngine.playNote(q.key, 4, config.speed);
    await new Promise(r => setTimeout(r, 400));
    await audioEngine.playInterval(q.rootNote, q.targetNote, config.playbackMode, q.resolvedDirection, config.speed);
  },

  getHint(_: EarQuestion): string { return 'Listen to how the interval relates to the tonic.'; },
  getPromptItem(q: EarQuestion): string { return (q as IntervalInContextQuestion).correctAnswer; },
  getAnswerContext(question: EarQuestion): string | null {
    return JSON.stringify({key: (question as IntervalInContextQuestion).key});
  },
};

registerExercise(intervalsInContext);
