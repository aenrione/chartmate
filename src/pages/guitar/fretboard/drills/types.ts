import type {FretPosition, NoteName, IntervalShort, CAGEDShape} from '../lib/musicTheory';
import type {DrillType, Difficulty} from '@/lib/local-db/fretboard';

// ── Drill Descriptor ─────────────────────────────────────────────────────────

export interface DrillDescriptor {
  type: DrillType;
  name: string;
  description: string;
  icon: string;
  difficulty: Difficulty;
  generator: QuestionGenerator;
  validator: AnswerValidator;
}

// ── Segregated Interfaces ────────────────────────────────────────────────────

export interface QuestionGenerator {
  generate(config: DrillConfig, weights?: PositionWeight[]): DrillQuestion;
  getAnswerOptions(): string[];
  getHint(question: DrillQuestion): string;
}

export interface AnswerValidator {
  validate(question: DrillQuestion, answer: string): boolean;
}

// ── Config (per-drill specifics via discriminated union) ──────────────────────

export interface DrillConfig {
  stringRange: [number, number];
  fretRange: [number, number];
  questionCount: number;
  timeLimit?: number;
}

export interface NoteFinderConfig extends DrillConfig {
  includeAccidentals: boolean;
}

// ── Question Types (discriminated union) ─────────────────────────────────────

export type DrillQuestion =
  | NoteFinderQuestion
  | IntervalSpotterQuestion
  | ScaleNavigatorQuestion
  | ChordToneFinderQuestion
  | OctaveMapperQuestion
  | CAGEDShapesQuestion;

export interface NoteFinderQuestion {
  type: 'note-finder';
  id: string;
  position: FretPosition;
  correctAnswer: NoteName;
}

export interface IntervalSpotterQuestion {
  type: 'interval-spotter';
  id: string;
  rootPosition: FretPosition;
  targetPosition: FretPosition;
  correctAnswer: IntervalShort;
}

export interface ScaleNavigatorQuestion {
  type: 'scale-navigator';
  id: string;
  rootNote: NoteName;
  scaleName: string;
  positionsToFill: FretPosition[];
  allScalePositions: FretPosition[];
  correctAnswer: string; // serialized positions
}

export interface ChordToneFinderQuestion {
  type: 'chord-tone-finder';
  id: string;
  chordRoot: NoteName;
  chordType: string;
  targetTone: string; // 'Root', '3rd', '5th', '7th'
  validPositions: FretPosition[];
  correctAnswer: string;
}

export interface OctaveMapperQuestion {
  type: 'octave-mapper';
  id: string;
  sourcePosition: FretPosition;
  sourceNote: NoteName;
  octavePositions: FretPosition[];
  correctAnswer: string;
}

export interface CAGEDShapesQuestion {
  type: 'caged-shapes';
  id: string;
  chordRoot: NoteName;
  shapePositions: FretPosition[];
  correctAnswer: CAGEDShape;
}

// ── Spaced Repetition Weights ────────────────────────────────────────────────

export interface PositionWeight {
  string: number;
  fret: number;
  weight: number;
}

// ── Answer Result ────────────────────────────────────────────────────────────

export interface AnswerResult {
  question: DrillQuestion;
  givenAnswer: string | null;
  isCorrect: boolean;
  isSkipped: boolean;
  responseTimeMs: number;
}
