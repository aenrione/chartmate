import type {NoteName} from '../fretboard/lib/musicTheory';

/**
 * A single chord voicing (shape) on the fretboard.
 *
 * - `frets`: array of 6 values (low E → high E).
 *     -1 = muted (X), 0 = open, 1+ = fretted
 * - `fingers`: array of 6 values matching `frets`.
 *     0 = not fingered (open/muted), 1-4 = index..pinky
 * - `barres`: optional list of barre descriptors
 * - `baseFret`: the fret number shown at the left of the diagram (1 = nut position)
 */
export interface ChordVoicing {
  frets: number[];
  fingers: number[];
  barres?: {fret: number; fromString: number; toString: number}[];
  baseFret: number;
}

export interface ChordDefinition {
  name: string;
  /** Display suffix, e.g. "m", "7", "maj7" */
  suffix: string;
  root: NoteName;
  voicings: ChordVoicing[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function chord(
  root: NoteName,
  suffix: string,
  voicings: ChordVoicing[],
): ChordDefinition {
  const name = suffix ? `${root}${suffix}` : root;
  return {name, suffix, root, voicings};
}

function v(
  frets: number[],
  fingers: number[],
  baseFret = 1,
  barres?: {fret: number; fromString: number; toString: number}[],
): ChordVoicing {
  return {frets, fingers, baseFret, barres};
}

// ── Chord Library ───────────────────────────────────────────────────────────

export const CHORD_LIBRARY: ChordDefinition[] = [
  // ── C ───────────────────────────────────────────────────────────────────
  chord('C', '', [
    v([-1, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0]),
    v([3, 3, 2, 0, 1, 0], [3, 3, 2, 0, 1, 0]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 3, 3, 3, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 8, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C', 'm', [
    v([-1, 3, 1, 0, 1, -1], [0, 3, 1, 0, 2, 0]),
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 8, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C', '7', [
    v([-1, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0]),
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 3, 1, 3, 1, 1], [1, 3, 1, 4, 1, 1], 8, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C', 'maj7', [
    v([-1, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0]),
    v([1, 1, 3, 2, 3, 1], [1, 1, 3, 2, 4, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C', 'm7', [
    v([-1, 3, 1, 3, 1, -1], [0, 3, 1, 4, 2, 0]),
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C', 'sus2', [
    v([-1, 3, 3, 0, 1, 0], [0, 3, 4, 0, 1, 0]),
    v([1, 1, 3, 3, 1, 1], [1, 1, 3, 4, 1, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C', 'sus4', [
    v([-1, 3, 3, 0, 1, 1], [0, 3, 4, 0, 1, 1]),
    v([1, 1, 3, 3, 4, 1], [1, 1, 2, 3, 4, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C', 'dim', [
    v([-1, 3, 4, 2, 1, -1], [0, 2, 4, 1, 3, 0]),
    v([1, 2, 3, 1, -1, -1], [1, 2, 3, 1, 0, 0], 8, [{fret: 1, fromString: 0, toString: 3}]),
  ]),
  chord('C', 'aug', [
    v([-1, 3, 2, 1, 1, 0], [0, 4, 3, 2, 1, 0]),
    v([1, 1, 2, 1, 1, -1], [1, 1, 2, 1, 1, 0], 4, [{fret: 1, fromString: 0, toString: 4}]),
  ]),

  // ── C#/Db ─────────────────────────────────────────────────────────────────
  chord('C#', '', [
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, 4, 3, 1, 2, 1], [0, 4, 3, 1, 2, 1]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 9, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C#', 'm', [
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, 4, 2, 1, 2, -1], [0, 4, 2, 1, 3, 0]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 9, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C#', '7', [
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, 4, 3, 4, 2, -1], [0, 2, 1, 3, 1, 0]),
  ]),
  chord('C#', 'maj7', [
    v([1, 1, 3, 2, 3, 1], [1, 1, 3, 2, 4, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('C#', 'm7', [
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
  ]),

  // ── D ───────────────────────────────────────────────────────────────────
  chord('D', '', [
    v([-1, -1, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 10, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('D', 'm', [
    v([-1, -1, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1]),
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 10, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('D', '7', [
    v([-1, -1, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3]),
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('D', 'maj7', [
    v([-1, -1, 0, 2, 2, 2], [0, 0, 0, 1, 2, 3]),
    v([1, 1, 3, 2, 3, 1], [1, 1, 3, 2, 4, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('D', 'm7', [
    v([-1, -1, 0, 2, 1, 1], [0, 0, 0, 2, 1, 1]),
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('D', 'sus2', [
    v([-1, -1, 0, 2, 3, 0], [0, 0, 0, 1, 3, 0]),
  ]),
  chord('D', 'sus4', [
    v([-1, -1, 0, 2, 3, 3], [0, 0, 0, 1, 2, 3]),
  ]),
  chord('D', 'dim', [
    v([-1, -1, 0, 1, 3, 1], [0, 0, 0, 1, 3, 2]),
  ]),
  chord('D', 'aug', [
    v([-1, -1, 0, 3, 3, 2], [0, 0, 0, 3, 4, 1]),
  ]),

  // ── Eb ──────────────────────────────────────────────────────────────────
  chord('Eb', '', [
    v([-1, -1, 1, 3, 4, 3], [0, 0, 1, 2, 4, 3]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 6, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 11, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('Eb', 'm', [
    v([-1, -1, 1, 3, 4, 2], [0, 0, 1, 3, 4, 2]),
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 6, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('Eb', '7', [
    v([-1, -1, 1, 3, 2, 3], [0, 0, 1, 3, 2, 4]),
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 6, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('Eb', 'maj7', [
    v([-1, -1, 1, 3, 3, 3], [0, 0, 1, 2, 3, 4]),
  ]),
  chord('Eb', 'm7', [
    v([-1, -1, 1, 3, 2, 2], [0, 0, 1, 4, 2, 3]),
  ]),

  // ── E ───────────────────────────────────────────────────────────────────
  chord('E', '', [
    v([0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 7, [{fret: 1, fromString: 0, toString: 5}]),
    v([4, 4, 2, 1, 0, 0], [3, 4, 2, 1, 0, 0]),
  ]),
  chord('E', 'm', [
    v([0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0]),
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 7, [{fret: 1, fromString: 0, toString: 5}]),
    v([0, 2, 2, 0, 3, 0], [0, 2, 3, 0, 4, 0]),
  ]),
  chord('E', '7', [
    v([0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0]),
    v([0, 2, 2, 1, 3, 0], [0, 2, 3, 1, 4, 0]),
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 7, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('E', 'maj7', [
    v([0, 2, 1, 1, 0, 0], [0, 3, 1, 2, 0, 0]),
    v([1, 1, 3, 2, 3, 1], [1, 1, 3, 2, 4, 1], 7, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('E', 'm7', [
    v([0, 2, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0]),
    v([0, 2, 2, 0, 3, 0], [0, 1, 1, 0, 2, 0]),
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 7, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('E', 'sus2', [
    v([0, 2, 4, 4, 0, 0], [0, 1, 3, 4, 0, 0]),
  ]),
  chord('E', 'sus4', [
    v([0, 2, 2, 2, 0, 0], [0, 1, 2, 3, 0, 0]),
  ]),
  chord('E', 'dim', [
    v([0, 1, 2, 0, -1, -1], [0, 1, 3, 0, 0, 0]),
  ]),
  chord('E', 'aug', [
    v([0, 3, 2, 1, 1, 0], [0, 4, 3, 2, 1, 0]),
  ]),

  // ── F ───────────────────────────────────────────────────────────────────
  chord('F', '', [
    v([1, 1, 2, 3, 3, 1], [1, 1, 2, 3, 4, 1], 1, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 3, 2, 1, 1], [0, 0, 3, 2, 1, 1]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 1, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 8, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('F', 'm', [
    v([1, 1, 1, 3, 3, 1], [1, 1, 1, 3, 4, 1], 1, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 3, 1, 1, 1], [0, 0, 3, 1, 1, 1], 1, [{fret: 1, fromString: 2, toString: 5}]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 8, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 1, 1, -1, -1], [0, 0, 1, 1, 0, 0], 10, [{fret: 1, fromString: 2, toString: 3}]),
  ]),
  chord('F', '7', [
    v([1, 1, 2, 1, 3, 1], [1, 1, 2, 1, 3, 1], 1, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 1, 2, 1, 1], [0, 0, 1, 3, 1, 2]),
  ]),
  chord('F', 'maj7', [
    v([1, -1, 2, 2, 1, 0], [1, 0, 3, 4, 2, 0]),
    v([-1, -1, 3, 2, 1, 0], [0, 0, 4, 3, 1, 0]),
    v([1, 1, 2, 2, 3, 1], [1, 1, 2, 3, 4, 1], 1, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('F', 'm7', [
    v([1, 1, 1, 1, 3, 1], [1, 1, 1, 1, 3, 1], 1, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 1, 1, 1, 1], [0, 0, 1, 1, 1, 1], 1, [{fret: 1, fromString: 2, toString: 5}]),
  ]),
  chord('F', 'sus2', [
    v([-1, -1, 3, 0, 1, 1], [0, 0, 3, 0, 1, 1]),
  ]),
  chord('F', 'sus4', [
    v([1, 1, 3, 3, 4, 1], [1, 1, 2, 3, 4, 1], 1, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('F', 'dim', [
    v([1, 2, 3, 1, -1, -1], [1, 2, 4, 1, 0, 0], 1, [{fret: 1, fromString: 0, toString: 3}]),
  ]),
  chord('F', 'aug', [
    v([1, -1, 3, 2, 2, 1], [1, 0, 4, 2, 3, 1]),
  ]),

  // ── F#/Gb ─────────────────────────────────────────────────────────────────
  chord('F#', '', [
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 4, 3, 2, 2], [0, 0, 4, 3, 1, 1]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 9, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('F#', 'm', [
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 4, 2, 2, 2], [0, 0, 4, 1, 1, 1]),
  ]),
  chord('F#', '7', [
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 4, 3, 2, 0], [0, 0, 4, 3, 2, 0]),
  ]),
  chord('F#', 'maj7', [
    v([1, 1, 3, 2, 3, 1], [1, 1, 3, 2, 4, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('F#', 'm7', [
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
  ]),

  // ── G ───────────────────────────────────────────────────────────────────
  chord('G', '', [
    v([3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3]),
    v([3, 2, 0, 0, 3, 3], [2, 1, 0, 0, 3, 4]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 10, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('G', 'm', [
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
    v([3, 1, 0, 3, 3, 3], [2, 1, 0, 3, 3, 4]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 10, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('G', '7', [
    v([3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1]),
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
    v([3, 2, 3, 0, 0, 1], [3, 2, 4, 0, 0, 1]),
  ]),
  chord('G', 'maj7', [
    v([3, 2, 0, 0, 0, 2], [3, 2, 0, 0, 0, 1]),
    v([1, 1, 3, 2, 3, 1], [1, 1, 3, 2, 4, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('G', 'm7', [
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 3, [{fret: 1, fromString: 0, toString: 5}]),
    v([3, 1, 3, 0, 3, -1], [2, 1, 3, 0, 4, 0]),
  ]),
  chord('G', 'sus2', [
    v([3, 0, 0, 0, 3, 3], [1, 0, 0, 0, 3, 4]),
  ]),
  chord('G', 'sus4', [
    v([3, 3, 0, 0, 1, 3], [2, 3, 0, 0, 1, 4]),
  ]),
  chord('G', 'dim', [
    v([3, 4, 2, 3, -1, -1], [1, 3, 2, 4, 0, 0]),
  ]),
  chord('G', 'aug', [
    v([3, 2, 1, 0, 0, 3], [3, 2, 1, 0, 0, 4]),
  ]),

  // ── Ab ──────────────────────────────────────────────────────────────────
  chord('Ab', '', [
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 1, 1, 1, 4], [0, 0, 1, 1, 1, 4], 1, [{fret: 1, fromString: 2, toString: 4}]),
    v([1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 11, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('Ab', 'm', [
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, -1, 1, 1, 0, 4], [0, 0, 1, 2, 0, 4]),
  ]),
  chord('Ab', '7', [
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('Ab', 'maj7', [
    v([1, 1, 3, 2, 3, 1], [1, 1, 3, 2, 4, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('Ab', 'm7', [
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 4, [{fret: 1, fromString: 0, toString: 5}]),
  ]),

  // ── A ───────────────────────────────────────────────────────────────────
  chord('A', '', [
    v([-1, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, 0, 2, 2, 2, 0], [0, 0, 1, 1, 1, 0]),
  ]),
  chord('A', 'm', [
    v([-1, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0]),
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, 0, 2, 2, 1, 0], [0, 0, 3, 4, 1, 0]),
  ]),
  chord('A', '7', [
    v([-1, 0, 2, 0, 2, 0], [0, 0, 2, 0, 3, 0]),
    v([-1, 0, 2, 2, 2, 3], [0, 0, 1, 1, 1, 2]),
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('A', 'maj7', [
    v([-1, 0, 2, 1, 2, 0], [0, 0, 3, 1, 4, 0]),
    v([1, 1, 3, 2, 3, 1], [1, 1, 3, 2, 4, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('A', 'm7', [
    v([-1, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0]),
    v([-1, 0, 2, 2, 1, 3], [0, 0, 2, 3, 1, 4]),
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('A', 'sus2', [
    v([-1, 0, 2, 2, 0, 0], [0, 0, 2, 3, 0, 0]),
    v([1, 1, 3, 3, 1, 1], [1, 1, 3, 4, 1, 1], 5, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('A', 'sus4', [
    v([-1, 0, 2, 2, 3, 0], [0, 0, 1, 2, 3, 0]),
  ]),
  chord('A', 'dim', [
    v([-1, 0, 1, 2, 1, -1], [0, 0, 1, 3, 2, 0]),
  ]),
  chord('A', 'aug', [
    v([-1, 0, 3, 2, 2, 1], [0, 0, 4, 3, 2, 1]),
  ]),

  // ── Bb ──────────────────────────────────────────────────────────────────
  chord('Bb', '', [
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 1, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, 1, 3, 3, 3, 1], [0, 1, 2, 3, 4, 1], 1, [{fret: 1, fromString: 1, toString: 5}]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 6, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('Bb', 'm', [
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 1, [{fret: 1, fromString: 0, toString: 5}]),
    v([-1, 1, 3, 3, 2, 1], [0, 1, 3, 4, 2, 1], 1, [{fret: 1, fromString: 1, toString: 5}]),
  ]),
  chord('Bb', '7', [
    v([-1, 1, 3, 1, 3, 1], [0, 1, 3, 1, 4, 1], 1, [{fret: 1, fromString: 1, toString: 5}]),
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 6, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('Bb', 'maj7', [
    v([-1, 1, 3, 2, 3, 1], [0, 1, 3, 2, 4, 1], 1, [{fret: 1, fromString: 1, toString: 5}]),
  ]),
  chord('Bb', 'm7', [
    v([-1, 1, 3, 1, 2, 1], [0, 1, 3, 1, 2, 1], 1, [{fret: 1, fromString: 1, toString: 5}]),
  ]),

  // ── B ───────────────────────────────────────────────────────────────────
  chord('B', '', [
    v([-1, 1, 4, 4, 4, 1], [0, 1, 2, 3, 4, 1], 2, [{fret: 1, fromString: 1, toString: 5}]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 1, 3, 3, 3, 1], [1, 1, 2, 3, 4, 1], 7, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('B', 'm', [
    v([-1, 1, 4, 4, 3, 1], [0, 1, 3, 4, 2, 1], 2, [{fret: 1, fromString: 1, toString: 5}]),
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 1, 3, 3, 2, 1], [1, 1, 3, 4, 2, 1], 7, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('B', '7', [
    v([-1, 2, 1, 2, 0, 2], [0, 2, 1, 3, 0, 4]),
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 1, 3, 1, 3, 1], [1, 1, 3, 1, 4, 1], 7, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('B', 'maj7', [
    v([-1, 2, 1, 3, 0, -1], [0, 2, 1, 4, 0, 0]),
    v([1, 1, 3, 2, 3, 1], [1, 1, 3, 2, 4, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('B', 'm7', [
    v([-1, 2, 0, 2, 0, 2], [0, 1, 0, 2, 0, 3]),
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 2, [{fret: 1, fromString: 0, toString: 5}]),
    v([1, 1, 3, 1, 2, 1], [1, 1, 3, 1, 2, 1], 7, [{fret: 1, fromString: 0, toString: 5}]),
  ]),
  chord('B', 'sus2', [
    v([-1, 2, 4, 4, 2, 2], [0, 1, 3, 4, 1, 1], 2, [{fret: 2, fromString: 1, toString: 5}]),
  ]),
  chord('B', 'sus4', [
    v([-1, 2, 4, 4, 5, 2], [0, 1, 2, 3, 4, 1], 2, [{fret: 2, fromString: 1, toString: 5}]),
  ]),
  chord('B', 'dim', [
    v([-1, 2, 3, 4, 3, -1], [0, 1, 2, 4, 3, 0]),
  ]),
  chord('B', 'aug', [
    v([-1, 2, 1, 0, 0, 3], [0, 2, 1, 0, 0, 3]),
  ]),
];

// ── Search Index ─────────────────────────────────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  '': 'Major',
  m: 'Minor',
  '7': 'Dominant 7',
  maj7: 'Major 7',
  m7: 'Minor 7',
  sus2: 'Suspended 2',
  sus4: 'Suspended 4',
  dim: 'Diminished',
  aug: 'Augmented',
};

const ENHARMONIC_SEARCH: Record<string, string> = {
  'Db': 'C#',
  'D#': 'Eb',
  'Gb': 'F#',
  'G#': 'Ab',
  'A#': 'Bb',
};

export function getDisplayName(def: ChordDefinition): string {
  return `${def.root} ${DISPLAY_NAMES[def.suffix] ?? def.suffix}`;
}

export function searchChords(query: string): ChordDefinition[] {
  if (!query.trim()) return [];

  const q = query.trim();
  const ql = q.toLowerCase();

  return CHORD_LIBRARY.filter(def => {
    const name = def.name.toLowerCase();
    const displayName = getDisplayName(def).toLowerCase();
    const rootLower = def.root.toLowerCase();

    // Direct match on name (e.g. "Am7", "C")
    if (name.startsWith(ql) || displayName.startsWith(ql)) return true;

    // Root match (e.g. "a" matches all A chords)
    if (rootLower === ql || rootLower.startsWith(ql)) return true;

    // Enharmonic match (e.g. "Db" finds C# chords)
    const enharmonicRoot = ENHARMONIC_SEARCH[q.charAt(0).toUpperCase() + q.slice(1)];
    if (enharmonicRoot && def.root === enharmonicRoot) return true;

    // Suffix search (e.g. "minor" finds all minor chords)
    const suffixDisplay = (DISPLAY_NAMES[def.suffix] ?? '').toLowerCase();
    if (suffixDisplay.includes(ql)) return true;

    return false;
  });
}

export function getAllRoots(): string[] {
  const roots = new Set(CHORD_LIBRARY.map(c => c.root));
  return Array.from(roots);
}

export function getSuffixes(): string[] {
  const suffixes = new Set(CHORD_LIBRARY.map(c => c.suffix));
  return Array.from(suffixes);
}
