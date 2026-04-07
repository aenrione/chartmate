// ── Constants ────────────────────────────────────────────────────────────────

export const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export type NoteName = (typeof NOTES)[number];

export const ENHARMONIC_MAP: Record<string, NoteName> = {
  'Db': 'C#',
  'D#': 'Eb',
  'Gb': 'F#',
  'G#': 'Ab',
  'A#': 'Bb',
};

export const STANDARD_TUNING: NoteName[] = ['E', 'A', 'D', 'G', 'B', 'E'];
export const STRING_COUNT = 6;
export const MAX_FRET = 22;
export const TOTAL_NOTES = 12;

export const FRET_MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
export const DOUBLE_MARKERS = [12];

// ── Intervals ────────────────────────────────────────────────────────────────

export const INTERVALS = [
  {semitones: 0, short: 'P1', name: 'Perfect Unison'},
  {semitones: 1, short: 'm2', name: 'Minor 2nd'},
  {semitones: 2, short: 'M2', name: 'Major 2nd'},
  {semitones: 3, short: 'm3', name: 'Minor 3rd'},
  {semitones: 4, short: 'M3', name: 'Major 3rd'},
  {semitones: 5, short: 'P4', name: 'Perfect 4th'},
  {semitones: 6, short: 'TT', name: 'Tritone'},
  {semitones: 7, short: 'P5', name: 'Perfect 5th'},
  {semitones: 8, short: 'm6', name: 'Minor 6th'},
  {semitones: 9, short: 'M6', name: 'Major 6th'},
  {semitones: 10, short: 'm7', name: 'Minor 7th'},
  {semitones: 11, short: 'M7', name: 'Major 7th'},
  {semitones: 12, short: 'P8', name: 'Octave'},
] as const;

export type IntervalShort = (typeof INTERVALS)[number]['short'];

// ── Scales ───────────────────────────────────────────────────────────────────

export const SCALES: Record<string, number[]> = {
  'Major': [0, 2, 4, 5, 7, 9, 11],
  'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
  'Pentatonic Major': [0, 2, 4, 7, 9],
  'Pentatonic Minor': [0, 3, 5, 7, 10],
  'Blues': [0, 3, 5, 6, 7, 10],
  'Dorian': [0, 2, 3, 5, 7, 9, 10],
  'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
  'Phrygian': [0, 1, 3, 5, 7, 8, 10],
  'Lydian': [0, 2, 4, 6, 7, 9, 11],
  'Locrian': [0, 1, 3, 5, 6, 8, 10],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
};

// ── Chord Types ──────────────────────────────────────────────────────────────

export const CHORD_TYPES: Record<string, number[]> = {
  'Major': [0, 4, 7],
  'Minor': [0, 3, 7],
  'Dominant 7': [0, 4, 7, 10],
  'Major 7': [0, 4, 7, 11],
  'Minor 7': [0, 3, 7, 10],
  'Diminished': [0, 3, 6],
  'Augmented': [0, 4, 8],
  'Sus2': [0, 2, 7],
  'Sus4': [0, 5, 7],
};

export const CHORD_TONE_LABELS = ['Root', '3rd', '5th', '7th', '9th'] as const;

// ── CAGED Shapes ─────────────────────────────────────────────────────────────

export type CAGEDShape = 'C' | 'A' | 'G' | 'E' | 'D';
export const CAGED_SHAPES: CAGEDShape[] = ['C', 'A', 'G', 'E', 'D'];

// ── Core Functions ───────────────────────────────────────────────────────────

export function noteIndex(note: string): number {
  const normalized = normalizeNoteName(note);
  return NOTES.indexOf(normalized);
}

export function normalizeNoteName(input: string): NoteName {
  if (NOTES.includes(input as NoteName)) return input as NoteName;
  if (input in ENHARMONIC_MAP) return ENHARMONIC_MAP[input];
  throw new Error(`Unknown note: ${input}`);
}

export function areEnharmonic(a: string, b: string): boolean {
  try {
    return noteIndex(a) === noteIndex(b);
  } catch {
    return false;
  }
}

export function noteAtPosition(stringIdx: number, fret: number, tuning = STANDARD_TUNING): NoteName {
  const openNote = tuning[stringIdx];
  const openIndex = noteIndex(openNote);
  return NOTES[(openIndex + fret) % TOTAL_NOTES];
}

export function semitonesBetween(noteA: string, noteB: string): number {
  const a = noteIndex(noteA);
  const b = noteIndex(noteB);
  return ((b - a) + TOTAL_NOTES) % TOTAL_NOTES;
}

export function intervalBetween(noteA: string, noteB: string): IntervalShort {
  const semitones = semitonesBetween(noteA, noteB);
  return INTERVALS[semitones].short;
}

export function transposeNote(note: string, semitones: number): NoteName {
  const idx = noteIndex(note);
  return NOTES[((idx + semitones) % TOTAL_NOTES + TOTAL_NOTES) % TOTAL_NOTES];
}

export function getScaleNotes(root: string, scaleName: string): NoteName[] {
  const intervals = SCALES[scaleName];
  if (!intervals) throw new Error(`Unknown scale: ${scaleName}`);
  return intervals.map(i => transposeNote(root, i));
}

export function getChordNotes(root: string, chordType: string): NoteName[] {
  const intervals = CHORD_TYPES[chordType];
  if (!intervals) throw new Error(`Unknown chord type: ${chordType}`);
  return intervals.map(i => transposeNote(root, i));
}

// ── Fretboard Model ──────────────────────────────────────────────────────────

export interface FretPosition {
  string: number;
  fret: number;
}

export interface FretboardModel {
  tuning: NoteName[];
  fretCount: number;
  noteAt(string: number, fret: number): NoteName;
  positionsFor(note: string): FretPosition[];
  allPositions(): FretPosition[];
}

export function createFretboardModel(
  tuning = STANDARD_TUNING,
  fretCount = MAX_FRET,
): FretboardModel {
  return {
    tuning,
    fretCount,

    noteAt(stringIdx: number, fret: number): NoteName {
      return noteAtPosition(stringIdx, fret, tuning);
    },

    positionsFor(note: string): FretPosition[] {
      const target = noteIndex(note);
      const positions: FretPosition[] = [];
      for (let s = 0; s < tuning.length; s++) {
        for (let f = 0; f <= fretCount; f++) {
          if (noteIndex(noteAtPosition(s, f, tuning)) === target) {
            positions.push({string: s, fret: f});
          }
        }
      }
      return positions;
    },

    allPositions(): FretPosition[] {
      const positions: FretPosition[] = [];
      for (let s = 0; s < tuning.length; s++) {
        for (let f = 0; f <= fretCount; f++) {
          positions.push({string: s, fret: f});
        }
      }
      return positions;
    },
  };
}
