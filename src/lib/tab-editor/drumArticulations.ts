import {model} from '@coderline/alphatab';

const {InstrumentArticulation, MusicFontSymbol, TechniqueSymbolPlacement, Clef} = model;

type Art = InstanceType<typeof InstrumentArticulation>;

/**
 * Standard drum kit articulation definitions.
 *
 * staffLine uses GP convention: 1 = top line, counting down by half-steps.
 * Standard 5-line percussion staff mapping:
 *   1 = top line (cymbals)
 *   2 = space below top (hi-hat)
 *   3 = second line (high tom)
 *   4 = space (mid tom)
 *   5 = middle line (snare)
 *   6 = space (low tom)
 *   7 = fourth line (floor tom)
 *   8 = space below fourth line (bass drum)
 *   9 = bottom line (hi-hat pedal / bass drum 2)
 */

const X = MusicFontSymbol.NoteheadXBlack;
const XH = MusicFontSymbol.NoteheadXHalf;
const XW = MusicFontSymbol.NoteheadXWhole;
const N = MusicFontSymbol.NoteheadBlack;
const NH = MusicFontSymbol.NoteheadHalf;
const NW = MusicFontSymbol.NoteheadWhole;
const NONE = MusicFontSymbol.None;
const CIRCLE = MusicFontSymbol.ArticStaccatoAbove;
const ABOVE = TechniqueSymbolPlacement.Above;

type MFS = InstanceType<typeof InstrumentArticulation>['noteHeadDefault'];

interface DrumDef {
  id: number;
  type: string;
  staffLine: number;
  midi: number;
  head: [MFS, MFS, MFS]; // [default, half, whole]
  tech?: MFS;
  techPlace?: typeof ABOVE;
}

const DRUM_DEFS: DrumDef[] = [
  // Kicks
  {id: 35, type: 'kick',   staffLine: 8, midi: 35, head: [N, NH, NW]},
  {id: 36, type: 'kick',   staffLine: 8, midi: 36, head: [N, NH, NW]},

  // Snare
  {id: 37, type: 'snare',  staffLine: 5, midi: 37, head: [X, XH, XW]},  // side stick
  {id: 38, type: 'snare',  staffLine: 5, midi: 38, head: [N, NH, NW]},
  {id: 39, type: 'snare',  staffLine: 5, midi: 39, head: [X, XH, XW]},  // hand clap
  {id: 40, type: 'snare',  staffLine: 5, midi: 40, head: [N, NH, NW]},   // electric snare

  // Toms
  {id: 41, type: 'tom',    staffLine: 7, midi: 41, head: [N, NH, NW]},   // floor tom
  {id: 43, type: 'tom',    staffLine: 7, midi: 43, head: [N, NH, NW]},   // floor tom 2
  {id: 45, type: 'tom',    staffLine: 6, midi: 45, head: [N, NH, NW]},   // low tom
  {id: 47, type: 'tom',    staffLine: 4, midi: 47, head: [N, NH, NW]},   // mid tom
  {id: 48, type: 'tom',    staffLine: 3, midi: 48, head: [N, NH, NW]},   // hi-mid tom
  {id: 50, type: 'tom',    staffLine: 3, midi: 50, head: [N, NH, NW]},   // high tom

  // Hi-Hat
  {id: 42, type: 'hihat',  staffLine: 1, midi: 42, head: [X, XH, XW]},   // closed
  {id: 44, type: 'hihat',  staffLine: 9, midi: 44, head: [X, XH, XW]},   // pedal
  {id: 46, type: 'hihat',  staffLine: 1, midi: 46, head: [X, XH, XW], tech: CIRCLE, techPlace: ABOVE}, // open

  // Cymbals
  {id: 49, type: 'cymbal', staffLine: 1, midi: 49, head: [X, XH, XW]},   // crash 1
  {id: 51, type: 'cymbal', staffLine: 1, midi: 51, head: [X, XH, XW]},   // ride
  {id: 52, type: 'cymbal', staffLine: 1, midi: 52, head: [X, XH, XW]},   // china
  {id: 53, type: 'cymbal', staffLine: 1, midi: 53, head: [X, XH, XW]},   // ride bell
  {id: 55, type: 'cymbal', staffLine: 1, midi: 55, head: [X, XH, XW]},   // splash
  {id: 57, type: 'cymbal', staffLine: 1, midi: 57, head: [X, XH, XW]},   // crash 2
];

/**
 * Build a sparse array of InstrumentArticulations indexed by MIDI note number.
 * alphaTab uses `note.percussionArticulation` as an array index into
 * `track.percussionArticulations`, so index must match the MIDI note value.
 */
export function buildPercussionArticulationsArray(): Art[] {
  // Create array large enough to hold all MIDI drum notes
  const maxId = Math.max(...DRUM_DEFS.map(d => d.id));
  const arr: Art[] = [];

  // Fill with empty placeholder articulations
  for (let i = 0; i <= maxId; i++) {
    // Default: invisible placeholder
    arr.push(new InstrumentArticulation('', 5, i, NONE, NONE, NONE, NONE, ABOVE, i));
  }

  // Overwrite with actual drum definitions
  for (const def of DRUM_DEFS) {
    arr[def.id] = new InstrumentArticulation(
      def.type,
      def.staffLine,
      def.midi,
      def.head[0],
      def.head[1],
      def.head[2],
      def.tech ?? NONE,
      def.techPlace ?? ABOVE,
      def.id,
    );
  }

  return arr;
}

/** Exported for backwards compatibility */
export const createDrumArticulations = buildPercussionArticulationsArray;

/** Get the percussion clef for drum tracks */
export { Clef };
