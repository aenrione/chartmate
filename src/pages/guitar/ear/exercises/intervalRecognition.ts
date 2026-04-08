// src/pages/guitar/ear/exercises/intervalRecognition.ts
import {audioEngine} from '@/lib/audio-engine';
import {pickRandom, nextQuestionId, pickWeightedItem, resolveDirection} from './common';
import {registerExercise} from './registry';
import type {ExerciseDescriptor, EarConfig, EarQuestion, IntervalQuestion, ItemWeight} from './types';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const TOTAL = 12;

// semitones for each interval
const INTERVAL_DEFS = [
  {short: 'P1', semitones: 0},
  {short: 'm2', semitones: 1},
  {short: 'M2', semitones: 2},
  {short: 'm3', semitones: 3},
  {short: 'M3', semitones: 4},
  {short: 'P4', semitones: 5},
  {short: 'TT', semitones: 6},
  {short: 'P5', semitones: 7},
  {short: 'm6', semitones: 8},
  {short: 'M6', semitones: 9},
  {short: 'm7', semitones: 10},
  {short: 'M7', semitones: 11},
  {short: 'P8', semitones: 12},
] as const;

const ALL_OPTIONS = INTERVAL_DEFS.map(i => i.short);

function transposeNote(note: string, semitones: number): string {
  const idx = NOTES.indexOf(note as any);
  return NOTES[((idx + semitones) % TOTAL + TOTAL) % TOTAL];
}

export const intervalRecognition: ExerciseDescriptor = {
  type: 'interval-recognition',
  name: 'Interval Recognition',
  description: 'Hear two notes and identify the interval between them.',
  icon: 'ArrowUpDown',
  difficulty: 'beginner',
  allOptions: ALL_OPTIONS,

  generate(config: EarConfig, weights?: ItemWeight[]): IntervalQuestion {
    const activeOptions = config.scope.length > 0 ? config.scope : ALL_OPTIONS;
    const chosen = pickWeightedItem(activeOptions, weights ?? []);
    const def = INTERVAL_DEFS.find(d => d.short === chosen)!;

    const rootNote = config.fixedRoot ? 'C' : pickRandom(NOTES);
    const targetNote = transposeNote(rootNote, def.semitones);
    const dir = resolveDirection(config.direction);

    return {
      type: 'interval-recognition',
      id: nextQuestionId(),
      rootNote,
      targetNote,
      resolvedDirection: dir,
      correctAnswer: chosen,
    };
  },

  validate(question: EarQuestion, answer: string): boolean {
    return (question as IntervalQuestion).correctAnswer === answer;
  },

  async play(question: EarQuestion, config: EarConfig): Promise<void> {
    const q = question as IntervalQuestion;
    await audioEngine.playInterval(q.rootNote, q.targetNote, config.playbackMode, q.resolvedDirection, config.speed);
  },

  getHint(question: EarQuestion): string {
    const q = question as IntervalQuestion;
    const def = INTERVAL_DEFS.find(d => d.short === q.correctAnswer)!;
    return `${def.semitones} semitone${def.semitones !== 1 ? 's' : ''} apart`;
  },

  getPromptItem(question: EarQuestion): string {
    return (question as IntervalQuestion).correctAnswer;
  },

  getAnswerContext(_question: EarQuestion): string | null {
    return null;
  },
};

registerExercise(intervalRecognition);
