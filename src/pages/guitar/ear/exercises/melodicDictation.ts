// src/pages/guitar/ear/exercises/melodicDictation.ts
import {audioEngine} from '@/lib/audio-engine';
import {pickRandom, nextQuestionId, shuffle} from './common';
import {registerExercise} from './registry';
import type {ExerciseDescriptor, EarConfig, EarQuestion, MelodicDictationQuestion, ItemWeight} from './types';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const TOTAL = 12;
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_LABELS = ['1', '2', '3', '4', '5', '6', '7'];
const ALL_OPTIONS = DEGREE_LABELS;

function transpose(root: string, semitones: number): string {
  const idx = NOTES.indexOf(root as any);
  return NOTES[((idx + semitones) % TOTAL + TOTAL) % TOTAL];
}

export const melodicDictation: ExerciseDescriptor = {
  type: 'melodic-dictation',
  name: 'Melodic Dictation',
  description: 'Listen to a short melody and identify each scale degree.',
  icon: 'Waves',
  difficulty: 'advanced',
  allOptions: ALL_OPTIONS,

  generate(config: EarConfig, _weights?: ItemWeight[]): MelodicDictationQuestion {
    const key = config.fixedRoot ? 'C' : pickRandom(NOTES);
    const length = Math.floor(Math.random() * 3) + 3; // 3-5 notes
    // Use only degrees 1-5 for playability
    const availableDegrees = [0, 1, 2, 3, 4]; // indices into MAJOR_INTERVALS
    const degreeIndices = Array.from({length}, () => pickRandom(availableDegrees));
    const notes = degreeIndices.map(i => transpose(key, MAJOR_INTERVALS[i]));
    const degrees = degreeIndices.map(i => DEGREE_LABELS[i]);
    return {
      type: 'melodic-dictation', id: nextQuestionId(),
      key, scaleName: 'Major', notes, degrees,
      correctAnswer: JSON.stringify(degrees),
    };
  },

  validate(question: EarQuestion, answer: string): boolean {
    return (question as MelodicDictationQuestion).correctAnswer === answer;
  },

  async play(question: EarQuestion, config: EarConfig): Promise<void> {
    const q = question as MelodicDictationQuestion;
    await audioEngine.playSequence(q.notes, config.speed);
  },

  getHint(question: EarQuestion): string {
    const q = question as MelodicDictationQuestion;
    return `${q.notes.length}-note melody in ${q.key} Major`;
  },

  getPromptItem(q: EarQuestion): string { return (q as MelodicDictationQuestion).key; },
  getAnswerContext(question: EarQuestion): string | null {
    const q = question as MelodicDictationQuestion;
    return JSON.stringify({key: q.key, scale: q.scaleName});
  },
};

registerExercise(melodicDictation);
