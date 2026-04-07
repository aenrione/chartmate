/**
 * Fretboard utility: maps string tuning + fret to note names.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface FretNote {
  name: string;      // e.g. "F#"
  octave: number;    // e.g. 4
  fullName: string;  // e.g. "F#4"
  midiNote: number;  // e.g. 66
  fret: number;
  stringIndex: number; // 0-based from highest string
}

/**
 * Get the note name for a MIDI note number.
 */
export function midiToNoteName(midi: number): {name: string; octave: number} {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return {name, octave};
}

/**
 * Generate all fret notes for a given string.
 * @param openMidi MIDI note of the open string
 * @param stringIndex 0-based index from highest string
 * @param maxFret Maximum fret number (inclusive)
 */
export function getStringFrets(openMidi: number, stringIndex: number, maxFret: number = 24): FretNote[] {
  const notes: FretNote[] = [];
  for (let fret = 0; fret <= maxFret; fret++) {
    const midiNote = openMidi + fret;
    const {name, octave} = midiToNoteName(midiNote);
    notes.push({
      name,
      octave,
      fullName: `${name}${octave}`,
      midiNote,
      fret,
      stringIndex,
    });
  }
  return notes;
}

/**
 * Build the full fretboard grid from tuning values.
 * Tuning is given highest-string-first (alphaTab convention).
 * Returns array of string arrays, each containing FretNote objects.
 */
export function buildFretboard(tuning: number[], maxFret: number = 24): FretNote[][] {
  return tuning.map((openMidi, stringIndex) =>
    getStringFrets(openMidi, stringIndex, maxFret)
  );
}

/**
 * Standard guitar tuning fretboard (highest to lowest: E4 B3 G3 D3 A2 E2)
 */
export const STANDARD_GUITAR_TUNING = [64, 59, 55, 50, 45, 40];
