/**
 * Bundled guitar chord library.
 *
 * Each chord has a root, quality, and one or more voicings.
 * Frets are ordered high-E → low-E (string 1→6 in alphaTab).
 * `null` means the string is muted / not played.
 * `barFret` indicates a barre across all strings at that fret.
 */

export interface ChordVoicing {
  /** Fret per string, index 0 = high E (string 1), index 5 = low E (string 6). null = muted. */
  frets: (number | null)[];
  /** Finger numbers per string (1-4), null = not fingered. For display only. */
  fingers?: (number | null)[];
  /** If the voicing starts at a higher fret position */
  baseFret?: number;
}

export interface ChordDefinition {
  /** e.g. "C", "Am", "G7", "F#m" */
  name: string;
  root: string;
  quality: string;
  voicings: ChordVoicing[];
}

// ── Chord Data ──────────────────────────────────────────

const CHORDS: ChordDefinition[] = [
  // ─── Major ───
  {name: 'C', root: 'C', quality: 'major', voicings: [
    {frets: [0, 1, 0, 2, 3, null], fingers: [null, 1, null, 2, 3, null]},
    {frets: [3, 5, 5, 5, 3, null], baseFret: 3, fingers: [1, 3, 3, 3, 1, null]},
    {frets: [8, 8, 9, 10, 10, 8], baseFret: 8, fingers: [1, 1, 2, 3, 4, 1]},
  ]},
  {name: 'D', root: 'D', quality: 'major', voicings: [
    {frets: [2, 3, 2, 0, null, null], fingers: [1, 3, 2, null, null, null]},
    {frets: [5, 7, 7, 7, 5, null], baseFret: 5, fingers: [1, 3, 3, 3, 1, null]},
    {frets: [10, 10, 11, 12, 12, 10], baseFret: 10, fingers: [1, 1, 2, 3, 4, 1]},
  ]},
  {name: 'E', root: 'E', quality: 'major', voicings: [
    {frets: [0, 0, 1, 2, 2, 0], fingers: [null, null, 1, 3, 2, null]},
    {frets: [4, 5, 4, 2, null, null], baseFret: 2, fingers: [3, 4, 3, 1, null, null]},
    {frets: [0, 0, 1, 2, 2, 0], fingers: [null, null, 1, 2, 3, null]},
  ]},
  {name: 'F', root: 'F', quality: 'major', voicings: [
    {frets: [1, 1, 2, 3, 3, 1], fingers: [1, 1, 2, 3, 4, 1]},
    {frets: [5, 6, 5, 3, null, null], baseFret: 3, fingers: [3, 4, 3, 1, null, null]},
    {frets: [1, 1, 2, 3, null, null], fingers: [1, 1, 2, 3, null, null]},
  ]},
  {name: 'G', root: 'G', quality: 'major', voicings: [
    {frets: [3, 0, 0, 0, 2, 3], fingers: [2, null, null, null, 1, 3]},
    {frets: [3, 3, 4, 5, 5, 3], baseFret: 3, fingers: [1, 1, 2, 3, 4, 1]},
    {frets: [7, 8, 7, 5, null, null], baseFret: 5, fingers: [3, 4, 3, 1, null, null]},
  ]},
  {name: 'A', root: 'A', quality: 'major', voicings: [
    {frets: [0, 2, 2, 2, 0, null], fingers: [null, 1, 2, 3, null, null]},
    {frets: [5, 5, 6, 7, 7, 5], baseFret: 5, fingers: [1, 1, 2, 3, 4, 1]},
    {frets: [9, 10, 9, 7, null, null], baseFret: 7, fingers: [3, 4, 3, 1, null, null]},
  ]},
  {name: 'B', root: 'B', quality: 'major', voicings: [
    {frets: [2, 4, 4, 4, 2, null], baseFret: 2, fingers: [1, 3, 3, 3, 1, null]},
    {frets: [7, 7, 8, 9, 9, 7], baseFret: 7, fingers: [1, 1, 2, 3, 4, 1]},
  ]},

  // ─── Minor ───
  {name: 'Cm', root: 'C', quality: 'minor', voicings: [
    {frets: [3, 4, 5, 5, 3, null], baseFret: 3, fingers: [1, 2, 3, 4, 1, null]},
    {frets: [8, 8, 8, 10, 10, 8], baseFret: 8, fingers: [1, 1, 1, 3, 4, 1]},
  ]},
  {name: 'Dm', root: 'D', quality: 'minor', voicings: [
    {frets: [1, 3, 2, 0, null, null], fingers: [1, 3, 2, null, null, null]},
    {frets: [5, 6, 7, 7, 5, null], baseFret: 5, fingers: [1, 2, 3, 4, 1, null]},
  ]},
  {name: 'Em', root: 'E', quality: 'minor', voicings: [
    {frets: [0, 0, 0, 2, 2, 0], fingers: [null, null, null, 2, 3, null]},
    {frets: [0, 0, 0, 2, 2, 0], fingers: [null, null, null, 2, 3, null]},
  ]},
  {name: 'Fm', root: 'F', quality: 'minor', voicings: [
    {frets: [1, 1, 1, 3, 3, 1], fingers: [1, 1, 1, 3, 4, 1]},
    {frets: [1, 1, 1, 3, 3, 1], fingers: [1, 1, 1, 3, 4, 1]},
  ]},
  {name: 'Gm', root: 'G', quality: 'minor', voicings: [
    {frets: [3, 3, 3, 5, 5, 3], baseFret: 3, fingers: [1, 1, 1, 3, 4, 1]},
    {frets: [6, 8, 8, 7, null, null], baseFret: 6, fingers: [1, 3, 4, 2, null, null]},
  ]},
  {name: 'Am', root: 'A', quality: 'minor', voicings: [
    {frets: [0, 1, 2, 2, 0, null], fingers: [null, 1, 2, 3, null, null]},
    {frets: [5, 5, 5, 7, 7, 5], baseFret: 5, fingers: [1, 1, 1, 3, 4, 1]},
  ]},
  {name: 'Bm', root: 'B', quality: 'minor', voicings: [
    {frets: [2, 3, 4, 4, 2, null], baseFret: 2, fingers: [1, 2, 3, 4, 1, null]},
    {frets: [7, 7, 7, 9, 9, 7], baseFret: 7, fingers: [1, 1, 1, 3, 4, 1]},
  ]},

  // ─── 7th (Dominant) ───
  {name: 'C7', root: 'C', quality: '7', voicings: [
    {frets: [0, 1, 3, 2, 3, null], fingers: [null, 1, 3, 2, 4, null]},
  ]},
  {name: 'D7', root: 'D', quality: '7', voicings: [
    {frets: [2, 1, 2, 0, null, null], fingers: [2, 1, 3, null, null, null]},
  ]},
  {name: 'E7', root: 'E', quality: '7', voicings: [
    {frets: [0, 0, 1, 0, 2, 0], fingers: [null, null, 1, null, 2, null]},
  ]},
  {name: 'F7', root: 'F', quality: '7', voicings: [
    {frets: [1, 1, 2, 1, 3, 1], fingers: [1, 1, 2, 1, 3, 1]},
  ]},
  {name: 'G7', root: 'G', quality: '7', voicings: [
    {frets: [1, 0, 0, 0, 2, 3], fingers: [1, null, null, null, 2, 3]},
  ]},
  {name: 'A7', root: 'A', quality: '7', voicings: [
    {frets: [0, 2, 0, 2, 0, null], fingers: [null, 2, null, 3, null, null]},
  ]},
  {name: 'B7', root: 'B', quality: '7', voicings: [
    {frets: [2, 0, 2, 1, 2, null], fingers: [3, null, 4, 1, 2, null]},
  ]},

  // ─── Minor 7th ───
  {name: 'Cm7', root: 'C', quality: 'm7', voicings: [
    {frets: [3, 4, 3, 5, 3, null], baseFret: 3, fingers: [1, 2, 1, 4, 1, null]},
  ]},
  {name: 'Dm7', root: 'D', quality: 'm7', voicings: [
    {frets: [1, 1, 2, 0, null, null], fingers: [1, 1, 2, null, null, null]},
  ]},
  {name: 'Em7', root: 'E', quality: 'm7', voicings: [
    {frets: [0, 0, 0, 0, 2, 0], fingers: [null, null, null, null, 1, null]},
  ]},
  {name: 'Am7', root: 'A', quality: 'm7', voicings: [
    {frets: [0, 1, 0, 2, 0, null], fingers: [null, 1, null, 2, null, null]},
  ]},

  // ─── Major 7th ───
  {name: 'Cmaj7', root: 'C', quality: 'maj7', voicings: [
    {frets: [0, 0, 0, 2, 3, null], fingers: [null, null, null, 2, 3, null]},
  ]},
  {name: 'Dmaj7', root: 'D', quality: 'maj7', voicings: [
    {frets: [2, 2, 2, 0, null, null], fingers: [1, 2, 3, null, null, null]},
  ]},
  {name: 'Fmaj7', root: 'F', quality: 'maj7', voicings: [
    {frets: [0, 1, 2, 3, null, null], fingers: [null, 1, 2, 3, null, null]},
  ]},
  {name: 'Gmaj7', root: 'G', quality: 'maj7', voicings: [
    {frets: [2, 0, 0, 0, 2, 3], fingers: [2, null, null, null, 1, 3]},
  ]},
  {name: 'Amaj7', root: 'A', quality: 'maj7', voicings: [
    {frets: [0, 2, 1, 2, 0, null], fingers: [null, 3, 1, 2, null, null]},
  ]},

  // ─── Suspended ───
  {name: 'Csus2', root: 'C', quality: 'sus2', voicings: [
    {frets: [3, 3, 0, 0, 3, null], fingers: [2, 3, null, null, 1, null]},
  ]},
  {name: 'Dsus2', root: 'D', quality: 'sus2', voicings: [
    {frets: [0, 3, 2, 0, null, null], fingers: [null, 3, 2, null, null, null]},
  ]},
  {name: 'Asus2', root: 'A', quality: 'sus2', voicings: [
    {frets: [0, 0, 2, 2, 0, null], fingers: [null, null, 1, 2, null, null]},
  ]},
  {name: 'Dsus4', root: 'D', quality: 'sus4', voicings: [
    {frets: [3, 3, 2, 0, null, null], fingers: [3, 4, 2, null, null, null]},
  ]},
  {name: 'Esus4', root: 'E', quality: 'sus4', voicings: [
    {frets: [0, 0, 2, 2, 2, 0], fingers: [null, null, 1, 2, 3, null]},
  ]},
  {name: 'Asus4', root: 'A', quality: 'sus4', voicings: [
    {frets: [0, 3, 2, 2, 0, null], fingers: [null, 3, 1, 2, null, null]},
  ]},

  // ─── Diminished ───
  {name: 'Cdim', root: 'C', quality: 'dim', voicings: [
    {frets: [2, 4, 5, 4, null, null], baseFret: 2, fingers: [1, 3, 4, 2, null, null]},
  ]},
  {name: 'Bdim', root: 'B', quality: 'dim', voicings: [
    {frets: [1, 3, 4, 3, null, null], fingers: [1, 3, 4, 2, null, null]},
  ]},

  // ─── Augmented ───
  {name: 'Caug', root: 'C', quality: 'aug', voicings: [
    {frets: [0, 1, 1, 2, 3, null], fingers: [null, 1, 1, 2, 3, null]},
  ]},
  {name: 'Eaug', root: 'E', quality: 'aug', voicings: [
    {frets: [0, 0, 1, 2, 2, 0], fingers: [null, null, 1, 2, 3, null]},
  ]},

  // ─── Power Chords ───
  {name: 'C5', root: 'C', quality: '5', voicings: [
    {frets: [null, null, null, 5, 3, null], baseFret: 3, fingers: [null, null, null, 3, 1, null]},
  ]},
  {name: 'D5', root: 'D', quality: '5', voicings: [
    {frets: [null, null, null, 7, 5, null], baseFret: 5, fingers: [null, null, null, 3, 1, null]},
  ]},
  {name: 'E5', root: 'E', quality: '5', voicings: [
    {frets: [null, null, null, 2, 2, 0], fingers: [null, null, null, 2, 3, null]},
  ]},
  {name: 'F5', root: 'F', quality: '5', voicings: [
    {frets: [null, null, null, 3, 3, 1], fingers: [null, null, null, 3, 4, 1]},
  ]},
  {name: 'G5', root: 'G', quality: '5', voicings: [
    {frets: [null, null, null, 5, 5, 3], fingers: [null, null, null, 3, 4, 1]},
  ]},
  {name: 'A5', root: 'A', quality: '5', voicings: [
    {frets: [null, null, null, 2, 0, null], fingers: [null, null, null, 2, null, null]},
  ]},
  {name: 'B5', root: 'B', quality: '5', voicings: [
    {frets: [null, null, null, 4, 2, null], baseFret: 2, fingers: [null, null, null, 3, 1, null]},
  ]},

  // ─── Sharp/Flat variants ───
  {name: 'C#', root: 'C#', quality: 'major', voicings: [
    {frets: [4, 6, 6, 6, 4, null], baseFret: 4, fingers: [1, 3, 3, 3, 1, null]},
  ]},
  {name: 'Db', root: 'Db', quality: 'major', voicings: [
    {frets: [4, 6, 6, 6, 4, null], baseFret: 4, fingers: [1, 3, 3, 3, 1, null]},
  ]},
  {name: 'Eb', root: 'Eb', quality: 'major', voicings: [
    {frets: [6, 8, 8, 8, 6, null], baseFret: 6, fingers: [1, 3, 3, 3, 1, null]},
  ]},
  {name: 'Ab', root: 'Ab', quality: 'major', voicings: [
    {frets: [4, 4, 5, 6, 6, 4], baseFret: 4, fingers: [1, 1, 2, 3, 4, 1]},
  ]},
  {name: 'Bb', root: 'Bb', quality: 'major', voicings: [
    {frets: [1, 3, 3, 3, 1, null], fingers: [1, 3, 3, 3, 1, null]},
    {frets: [6, 6, 7, 8, 8, 6], baseFret: 6, fingers: [1, 1, 2, 3, 4, 1]},
  ]},
  {name: 'F#', root: 'F#', quality: 'major', voicings: [
    {frets: [2, 2, 3, 4, 4, 2], baseFret: 2, fingers: [1, 1, 2, 3, 4, 1]},
  ]},
  {name: 'G#', root: 'G#', quality: 'major', voicings: [
    {frets: [4, 4, 5, 6, 6, 4], baseFret: 4, fingers: [1, 1, 2, 3, 4, 1]},
  ]},

  {name: 'C#m', root: 'C#', quality: 'minor', voicings: [
    {frets: [4, 5, 6, 6, 4, null], baseFret: 4, fingers: [1, 2, 3, 4, 1, null]},
  ]},
  {name: 'Ebm', root: 'Eb', quality: 'minor', voicings: [
    {frets: [6, 7, 8, 8, 6, null], baseFret: 6, fingers: [1, 2, 3, 4, 1, null]},
  ]},
  {name: 'F#m', root: 'F#', quality: 'minor', voicings: [
    {frets: [2, 2, 2, 4, 4, 2], baseFret: 2, fingers: [1, 1, 1, 3, 4, 1]},
  ]},
  {name: 'G#m', root: 'G#', quality: 'minor', voicings: [
    {frets: [4, 4, 4, 6, 6, 4], baseFret: 4, fingers: [1, 1, 1, 3, 4, 1]},
  ]},
  {name: 'Bbm', root: 'Bb', quality: 'minor', voicings: [
    {frets: [1, 2, 3, 3, 1, null], fingers: [1, 2, 3, 4, 1, null]},
  ]},
];

// ── Public API ──────────────────────────────────────────

/** Search chords by name (case-insensitive prefix match). */
export function searchChords(query: string): ChordDefinition[] {
  if (!query.trim()) return CHORDS;
  const q = query.trim().toLowerCase();
  return CHORDS.filter(c => c.name.toLowerCase().startsWith(q));
}

/** Get all available chords. */
export function getAllChords(): ChordDefinition[] {
  return CHORDS;
}

/** Get a specific chord by exact name. */
export function getChord(name: string): ChordDefinition | undefined {
  return CHORDS.find(c => c.name.toLowerCase() === name.toLowerCase());
}

/**
 * Convert a chord voicing's frets array (high-E first) to the format needed
 * by scoreOperations (which uses alphaTab string numbers, 1-based).
 * Returns an array of {stringNumber, fret} for non-null frets.
 */
export function voicingToNotes(voicing: ChordVoicing): {stringNumber: number; fret: number}[] {
  const notes: {stringNumber: number; fret: number}[] = [];
  for (let i = 0; i < voicing.frets.length; i++) {
    const fret = voicing.frets[i];
    if (fret !== null) {
      notes.push({stringNumber: i + 1, fret});
    }
  }
  return notes;
}
