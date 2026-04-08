// src/pages/guitar/ear/exercises/perfectPitch.ts
import {audioEngine} from '@/lib/audio-engine';
import {pickRandom, nextQuestionId, pickWeightedItem} from './common';
import {registerExercise} from './registry';
import type {ExerciseDescriptor, EarConfig, EarQuestion, PerfectPitchQuestion, ItemWeight} from './types';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const OCTAVES = [3, 4, 5] as const;

export const perfectPitch: ExerciseDescriptor = {
  type: 'perfect-pitch',
  name: 'Perfect Pitch',
  description: 'Hear a single note and identify it by name.',
  icon: 'Music',
  difficulty: 'beginner',
  allOptions: [...NOTES],

  generate(config: EarConfig, weights?: ItemWeight[]): PerfectPitchQuestion {
    const activeOptions = config.scope.length > 0 ? config.scope : [...NOTES];
    const note = config.fixedRoot ? 'C' : pickWeightedItem(activeOptions, weights ?? []);
    const octave = pickRandom(OCTAVES);
    return {
      type: 'perfect-pitch',
      id: nextQuestionId(),
      note,
      octave,
      correctAnswer: note,
    };
  },

  validate(question: EarQuestion, answer: string): boolean {
    return (question as PerfectPitchQuestion).correctAnswer === answer;
  },

  async play(question: EarQuestion, config: EarConfig): Promise<void> {
    const q = question as PerfectPitchQuestion;
    await audioEngine.playNote(q.note, q.octave, config.speed);
  },

  getHint(question: EarQuestion): string {
    const q = question as PerfectPitchQuestion;
    const idx = NOTES.indexOf(q.note as any);
    const isAccidental = q.note.includes('#') || q.note.includes('b');
    return isAccidental ? 'This is an accidental (black key)' : `Natural note — position ${idx + 1} in C major context`;
  },

  getPromptItem(question: EarQuestion): string {
    return (question as PerfectPitchQuestion).correctAnswer;
  },

  getAnswerContext(_question: EarQuestion): string | null {
    return null;
  },
};

registerExercise(perfectPitch);
