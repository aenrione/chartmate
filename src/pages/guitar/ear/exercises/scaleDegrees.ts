// src/pages/guitar/ear/exercises/scaleDegrees.ts
import {audioEngine} from '@/lib/audio-engine';
import {pickRandom, nextQuestionId, pickWeightedItem} from './common';
import {registerExercise} from './registry';
import type {ExerciseDescriptor, EarConfig, EarQuestion, ScaleDegreeQuestion, ItemWeight} from './types';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const TOTAL = 12;
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_LABELS = ['1', '2', '3', '4', '5', '6', '7'];
const ALL_OPTIONS = DEGREE_LABELS;

function transposeNote(root: string, semitones: number): string {
  const idx = NOTES.indexOf(root as any);
  return NOTES[((idx + semitones) % TOTAL + TOTAL) % TOTAL];
}

export const scaleDegrees: ExerciseDescriptor = {
  type: 'scale-degrees',
  name: 'Scale Degrees',
  description: 'Identify scale degrees within an established key context.',
  icon: 'Hash',
  difficulty: 'intermediate',
  allOptions: ALL_OPTIONS,

  generate(config: EarConfig, weights?: ItemWeight[]): ScaleDegreeQuestion {
    const key = config.fixedRoot ? 'C' : pickRandom(NOTES);
    const activeOptions = config.scope.length > 0 ? config.scope : ALL_OPTIONS;
    const degreeLabel = pickWeightedItem(activeOptions, weights ?? []);
    const degreeIndex = DEGREE_LABELS.indexOf(degreeLabel);
    const semitones = MAJOR_INTERVALS[degreeIndex];
    const degreeNote = transposeNote(key, semitones);
    return {
      type: 'scale-degrees', id: nextQuestionId(),
      key, scaleName: 'Major', degree: degreeIndex + 1,
      degreeNote, correctAnswer: degreeLabel,
    };
  },

  validate(question: EarQuestion, answer: string): boolean {
    return (question as ScaleDegreeQuestion).correctAnswer === answer;
  },

  async play(question: EarQuestion, config: EarConfig): Promise<void> {
    const q = question as ScaleDegreeQuestion;
    // Play tonic first to establish key context, then the degree note
    const tonicNote = q.key;
    await audioEngine.playNote(tonicNote, 4, config.speed);
    await new Promise(r => setTimeout(r, 400));
    await audioEngine.playNote(q.degreeNote, 4, config.speed);
  },

  getHint(question: EarQuestion): string {
    const q = question as ScaleDegreeQuestion;
    return `Degree ${q.degree} of ${q.key} Major`;
  },

  getPromptItem(q: EarQuestion): string { return (q as ScaleDegreeQuestion).correctAnswer; },

  getAnswerContext(question: EarQuestion): string | null {
    const q = question as ScaleDegreeQuestion;
    return JSON.stringify({key: q.key, scale: q.scaleName});
  },
};

registerExercise(scaleDegrees);
