// src/lib/curriculum/types.ts

export type Instrument = 'guitar' | 'drums';

// ── Activity types ────────────────────────────────────────────────────────────

export interface TheoryCardActivity {
  type: 'theory-card';
  markdown: string;
  image?: string;
  srs?: boolean;
}

export interface ChordDiagramActivity {
  type: 'chord-diagram';
  chord: string;
  /** 6 values, one per string (high e to low E), -1 = muted, 0 = open */
  frets: [number, number, number, number, number, number];
  /** Which finger (1-4) on each string, 0 = none */
  fingers?: [number, number, number, number, number, number];
  srs?: boolean;
}

export interface QuizActivity {
  type: 'quiz';
  question: string;
  choices: string[];
  /** Zero-based index of correct choice */
  answer: number;
  explanation?: string;
  srs?: boolean;
}

export interface FretboardDrillActivity {
  type: 'fretboard-drill';
  /** Note names to find, e.g. ["G2", "B2", "D3"] */
  notes: string[];
  /** How many correct answers needed to pass (defaults to notes.length) */
  requiredCorrect?: number;
}

export interface TabExerciseActivity {
  type: 'tab-exercise';
  /**
   * "db:<id>" references tab_compositions.id
   * "bundled:<name>" reserved for future bundled assets
   */
  compositionId: string;
  instruction: string;
  /** Seconds before Continue unlocks (default 5) */
  unlockAfterSeconds?: number;
}

export type Activity =
  | TheoryCardActivity
  | ChordDiagramActivity
  | QuizActivity
  | FretboardDrillActivity
  | TabExerciseActivity;

// ── Lesson ────────────────────────────────────────────────────────────────────

export interface Lesson {
  id: string;
  title: string;
  /** XP awarded on completion (used in Plan 2) */
  xp: number;
  activities: Activity[];
}

// ── Unit ──────────────────────────────────────────────────────────────────────

export interface UnitMeta {
  id: string;
  title: string;
  description: string;
  icon?: string;
  /** IDs of units that must be completed before this one unlocks */
  prerequisites: string[];
  /** Ordered lesson IDs — matches the lesson JSON filenames without extension */
  lessons: string[];
}

// ── Skill Tree ────────────────────────────────────────────────────────────────

export interface SkillTree {
  instrument: Instrument;
  version: string;
  units: UnitMeta[];
}

// ── Loaded unit (skill-tree unit + loaded lesson data) ───────────────────────

export interface LoadedUnit extends UnitMeta {
  loadedLessons: Lesson[];
}
