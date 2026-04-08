// src/pages/guitar/ear/exercises/types.ts
import type {EarExerciseType, EarDifficulty, PlaybackMode, Direction, Speed} from '@/lib/local-db/ear-training';

export type {EarExerciseType, EarDifficulty, PlaybackMode, Direction, Speed};

// ── Config ───────────────────────────────────────────────────────────────────

export interface EarConfig {
  questionCount: number;
  playbackMode: PlaybackMode;
  direction: Direction;
  speed: Speed;
  fixedRoot: boolean;
  autoAdvance: boolean;
  scope: string[]; // subset of answer options; empty = all
}

export const DEFAULT_EAR_CONFIG: EarConfig = {
  questionCount: 20,
  playbackMode: 'melodic',
  direction: 'both',
  speed: 'medium',
  fixedRoot: false,
  autoAdvance: true,
  scope: [],
};

// ── Exercise Descriptor ──────────────────────────────────────────────────────

export interface ExerciseDescriptor {
  type: EarExerciseType;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  difficulty: EarDifficulty;
  /** All possible answer options for this exercise (full set). */
  allOptions: string[];
  generate(config: EarConfig, weights?: ItemWeight[]): EarQuestion;
  validate(question: EarQuestion, answer: string): boolean;
  /** Trigger audio playback for the question — returns a promise. */
  play(question: EarQuestion, config: EarConfig): Promise<void>;
  getHint(question: EarQuestion): string;
  /** Extract the prompt_item for DB logging (e.g. the correct answer, or the interval name). */
  getPromptItem(question: EarQuestion): string;
  /** Extract answer_context JSON string for DB logging, or null. */
  getAnswerContext(question: EarQuestion): string | null;
}

// ── Question Types ───────────────────────────────────────────────────────────

export type EarQuestion =
  | IntervalQuestion
  | PerfectPitchQuestion
  | ChordQuestion
  | ScaleQuestion
  | ScaleDegreeQuestion
  | ChordProgressionQuestion
  | IntervalInContextQuestion
  | MelodicDictationQuestion;

export interface IntervalQuestion {
  type: 'interval-recognition';
  id: string;
  rootNote: string;
  targetNote: string;
  resolvedDirection: 'ascending' | 'descending';
  correctAnswer: string; // interval short name e.g. 'm3'
}

export interface PerfectPitchQuestion {
  type: 'perfect-pitch';
  id: string;
  note: string;
  octave: number;
  correctAnswer: string; // note name e.g. 'C#'
}

export interface ChordQuestion {
  type: 'chord-recognition';
  id: string;
  rootNote: string;
  chordType: string;
  notes: string[];
  correctAnswer: string; // chord type name e.g. 'Major'
}

export interface ScaleQuestion {
  type: 'scale-recognition';
  id: string;
  rootNote: string;
  scaleName: string;
  notes: string[];
  correctAnswer: string; // scale name e.g. 'Dorian'
}

export interface ScaleDegreeQuestion {
  type: 'scale-degrees';
  id: string;
  key: string;
  scaleName: string;
  degree: number; // 1-7
  degreeNote: string;
  correctAnswer: string; // e.g. '1', '♭3', '5'
}

export interface ChordProgressionQuestion {
  type: 'chord-progressions';
  id: string;
  key: string;
  chordTypes: string[]; // e.g. ['Major', 'Minor', 'Major', 'Major']
  chordNotes: string[][]; // notes for each chord
  correctAnswer: string; // JSON array e.g. '["Major","Minor","Major","Major"]'
}

export interface IntervalInContextQuestion {
  type: 'intervals-in-context';
  id: string;
  key: string;
  rootNote: string;
  targetNote: string;
  resolvedDirection: 'ascending' | 'descending';
  correctAnswer: string; // interval short name
}

export interface MelodicDictationQuestion {
  type: 'melodic-dictation';
  id: string;
  key: string;
  scaleName: string;
  notes: string[]; // 3-5 notes
  degrees: string[]; // scale degree labels for each note
  correctAnswer: string; // JSON array of degree labels
}

// ── Spaced Repetition ────────────────────────────────────────────────────────

export interface ItemWeight {
  item: string; // prompt_item value
  weight: number;
}

// ── Answer Result ─────────────────────────────────────────────────────────────

export interface EarAnswerResult {
  question: EarQuestion;
  givenAnswer: string | null;
  isCorrect: boolean;
  isSkipped: boolean;
  responseTimeMs: number;
}
