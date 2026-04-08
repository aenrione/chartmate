// src/pages/guitar/ear/exercises/chordProgressions.ts
import {audioEngine} from '@/lib/audio-engine';
import {pickRandom, nextQuestionId} from './common';
import {registerExercise} from './registry';
import type {ExerciseDescriptor, EarConfig, EarQuestion, ChordProgressionQuestion, ItemWeight} from './types';

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const TOTAL = 12;

const CHORD_INTERVALS: Record<string, number[]> = {
  'Major': [0, 4, 7], 'Minor': [0, 3, 7],
  'Dominant 7': [0, 4, 7, 10], 'Major 7': [0, 4, 7, 11], 'Minor 7': [0, 3, 7, 10],
  'Diminished': [0, 3, 6],
};

// Common progressions: array of [semitones-from-root, chord-type] pairs
const PROGRESSIONS = [
  {name: 'I-IV-V-I',   chords: [[0,'Major'],[5,'Major'],[7,'Major'],[0,'Major']]},
  {name: 'I-V-vi-IV',  chords: [[0,'Major'],[7,'Major'],[9,'Minor'],[5,'Major']]},
  {name: 'ii-V-I',     chords: [[2,'Minor'],[7,'Major'],[0,'Major']]},
  {name: 'I-vi-IV-V',  chords: [[0,'Major'],[9,'Minor'],[5,'Major'],[7,'Major']]},
  {name: 'i-VII-VI-VII',chords: [[0,'Minor'],[10,'Major'],[8,'Major'],[10,'Major']]},
] as const;

function buildChordNotes(root: string, intervals: number[]): string[] {
  const idx = NOTES.indexOf(root as any);
  return intervals.map(i => NOTES[((idx + i) % TOTAL + TOTAL) % TOTAL]);
}

export const chordProgressions: ExerciseDescriptor = {
  type: 'chord-progressions',
  name: 'Chord Progressions',
  description: 'Identify the chords in a played progression.',
  icon: 'ListMusic',
  difficulty: 'advanced',
  allOptions: Object.keys(CHORD_INTERVALS),

  generate(config: EarConfig, _weights?: ItemWeight[]): ChordProgressionQuestion {
    const key = config.fixedRoot ? 'C' : pickRandom(NOTES);
    const prog = pickRandom(PROGRESSIONS);
    const keyIdx = NOTES.indexOf(key as any);
    const chordTypes = (prog.chords as readonly (readonly [number, string])[]).map(([, type]) => type);
    const chordNotes = (prog.chords as readonly (readonly [number, string])[]).map(([semitones, type]) => {
      const root = NOTES[((keyIdx + semitones) % TOTAL + TOTAL) % TOTAL];
      return buildChordNotes(root, CHORD_INTERVALS[type]);
    });
    return {
      type: 'chord-progressions', id: nextQuestionId(),
      key, chordTypes, chordNotes,
      correctAnswer: JSON.stringify(chordTypes),
    };
  },

  validate(question: EarQuestion, answer: string): boolean {
    return (question as ChordProgressionQuestion).correctAnswer === answer;
  },

  async play(question: EarQuestion, config: EarConfig): Promise<void> {
    const q = question as ChordProgressionQuestion;
    await audioEngine.playProgression(q.chordNotes, config.speed);
  },

  getHint(question: EarQuestion): string {
    const q = question as ChordProgressionQuestion;
    return `${q.chordTypes.length}-chord progression in ${q.key}`;
  },

  getPromptItem(q: EarQuestion): string {
    return (q as ChordProgressionQuestion).correctAnswer;
  },

  getAnswerContext(question: EarQuestion): string | null {
    const q = question as ChordProgressionQuestion;
    return JSON.stringify({key: q.key});
  },
};

registerExercise(chordProgressions);
