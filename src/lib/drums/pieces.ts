/**
 * The single drum role vocabulary.
 *
 * Three overlapping tables used to exist:
 *   - `DRUM_DEFS.type` in src/lib/tab-editor/drumArticulations.ts  (5 coarse roles)
 *   - `DrumVoice` in src/lib/fill-detector/types.ts                (6 coarse roles)
 *   - `DrumNoteInstrument` in src/pages/sheet-music/drumTypes.ts   (8 pieces)
 *
 * The third is the only lossless one — its 8 values are exactly the 8 things a
 * Clone Hero / YARG pro-drums `.chart` can express. So it is the canonical enum
 * here and the other two are derived from it.
 */

import {noteTypes, noteFlags, type NoteEvent} from '@eliwhite/scan-chart';

/** A physical piece of the kit. The finest granularity `.chart` can represent. */
export type DrumPiece =
  | 'kick'
  | 'snare'
  | 'high-tom'
  | 'mid-tom'
  | 'floor-tom'
  | 'hihat'
  | 'ride'
  | 'crash';

/** Coarse category. Derived from DrumPiece; used by notation and fill heuristics. */
export type DrumRole = 'kick' | 'snare' | 'tom' | 'hat' | 'cymbal';

export const DRUM_PIECES: readonly DrumPiece[] = [
  'kick', 'snare', 'high-tom', 'mid-tom', 'floor-tom', 'hihat', 'ride', 'crash',
] as const;

export const PIECE_TO_ROLE: Record<DrumPiece, DrumRole> = {
  kick: 'kick',
  snare: 'snare',
  'high-tom': 'tom',
  'mid-tom': 'tom',
  'floor-tom': 'tom',
  hihat: 'hat',
  ride: 'cymbal',
  crash: 'cymbal',
};

/**
 * Canonical General MIDI note for each piece — what we emit when going *out*
 * to MIDI or to an AlphaTab percussion articulation. Matches the pre-existing
 * `DRUM_MIDI_MAP` in convertToAlphaTabDrums.ts exactly.
 */
export const PIECE_TO_GM: Record<DrumPiece, number> = {
  kick: 36,        // Bass Drum 1
  snare: 38,       // Acoustic Snare
  'high-tom': 48,  // Hi-Mid Tom
  'mid-tom': 45,   // Low Tom
  'floor-tom': 41, // Low Floor Tom
  hihat: 42,       // Closed Hi-Hat
  ride: 51,        // Ride Cymbal 1
  crash: 49,       // Crash Cymbal 1
};

/** Where a piece lives in a 4-lane-pro `.chart`. */
export interface ChartLane {
  /** 0 = kick, 1 = red, 2 = yellow, 3 = blue, 4 = green */
  lane: 0 | 1 | 2 | 3 | 4;
  /**
   * In `.chart`, lanes 2/3/4 are TOMS by default and the 66/67/68 markers
   * promote them to CYMBALS. (In `.mid` the polarity is the exact inverse —
   * see writeChart.ts.)
   */
  cymbal: boolean;
}

export const PIECE_TO_LANE: Record<DrumPiece, ChartLane> = {
  kick:        {lane: 0, cymbal: false},
  snare:       {lane: 1, cymbal: false},
  'high-tom':  {lane: 2, cymbal: false},
  hihat:       {lane: 2, cymbal: true},
  'mid-tom':   {lane: 3, cymbal: false},
  ride:        {lane: 3, cymbal: true},
  'floor-tom': {lane: 4, cymbal: false},
  crash:       {lane: 4, cymbal: true},
};

/**
 * General MIDI percussion → piece.
 *
 * Entries marked FOLD have no distinct target in a 4-lane-pro chart and are
 * deliberately merged into the nearest piece rather than dropped — the hit
 * survives, the nuance does not.
 *
 * Guitar Pro's fallback articulation table (091 rim shot, 092 half-open hat,
 * 093 ride edge, 094-098 chokes, 126/127 ride middle/bell) needs no entries of
 * its own: a GP note's `percussionArticulation` is an index resolved through
 * `.outputMidiNumber`, so those articulations arrive here already as GM notes.
 */
export const GM_TO_PIECE: Readonly<Record<number, DrumPiece>> = {
  35: 'kick',
  36: 'kick',
  37: 'snare',       // FOLD side stick      → snare
  38: 'snare',
  39: 'snare',       // FOLD hand clap       → snare
  40: 'snare',
  41: 'floor-tom',
  42: 'hihat',
  43: 'floor-tom',
  44: 'hihat',       // FOLD pedal hi-hat    → hihat (no pedal lane in CH)
  45: 'mid-tom',
  46: 'hihat',       // FOLD open hi-hat     → hihat (openness is unrepresentable)
  47: 'mid-tom',
  48: 'high-tom',
  49: 'crash',
  50: 'high-tom',
  51: 'ride',
  52: 'crash',       // FOLD china           → crash
  53: 'ride',        // FOLD ride bell       → ride
  55: 'crash',       // FOLD splash          → crash
  56: 'high-tom',    // FOLD cowbell         → yellow tom (see COWBELL note below)
  57: 'crash',
  59: 'ride',        // FOLD ride cymbal 2   → ride
  75: 'high-tom',    // FOLD claves          → yellow tom (see COWBELL note below)
};

/**
 * Percussion with no musically honest target in a 4-lane-pro chart. These are
 * DROPPED, and every exporter reports how many it dropped rather than failing
 * silently.
 *
 * COWBELL note: 56 (cowbell) and 75 (claves) are the two exceptions above —
 * they fold to the yellow tom instead of being dropped, because they carry a
 * real rhythmic line (two lessons in the drum curriculum have a "Clave" track)
 * and dropping them would delete that line without a trace.
 */
export const DROPPED_GM: ReadonlySet<number> = new Set([
  54, 58,                                       // tambourine, vibraslap
  60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,   // bongos, congas, timbales, agogo, cabasa, maracas
  71, 72, 73, 74, 76, 77, 78, 79, 80, 81,       // whistles, guiro, woodblock, cuica, triangle
]);

/** GM note → piece, or null if it has no target and must be dropped. */
export function pieceFromGm(midi: number): DrumPiece | null {
  return GM_TO_PIECE[midi] ?? null;
}

/** `.chart` lane + cymbal flag → piece. Inverse of PIECE_TO_LANE. */
export function laneToPiece(lane: number, cymbal: boolean): DrumPiece | null {
  switch (lane) {
    case 0: return 'kick';
    case 1: return 'snare';
    case 2: return cymbal ? 'hihat' : 'high-tom';
    case 3: return cymbal ? 'ride' : 'mid-tom';
    case 4: return cymbal ? 'crash' : 'floor-tom';
    default: return null;
  }
}

/**
 * A parsed scan-chart NoteEvent → piece.
 *
 * scan-chart normalises both `.chart` and `.mid` polarities for us: when the
 * chart is four-lane-pro it always sets exactly one of `tom` / `cymbal` on
 * lanes 2-4, so there is no ambiguous case left to guess at. A chart parsed as
 * plain four-lane (no pro_drums, no markers) comes back all-tom, which is the
 * correct reading of that chart, not a bug.
 */
export function pieceFromChartNote(note: NoteEvent): DrumPiece | null {
  const cymbal = (note.flags & noteFlags.cymbal) !== 0;
  switch (note.type) {
    case noteTypes.kick:       return 'kick';
    case noteTypes.redDrum:    return 'snare';
    case noteTypes.yellowDrum: return cymbal ? 'hihat' : 'high-tom';
    case noteTypes.blueDrum:   return cymbal ? 'ride' : 'mid-tom';
    case noteTypes.greenDrum:  return cymbal ? 'crash' : 'floor-tom';
    default:                   return null;
  }
}

export function roleOf(piece: DrumPiece): DrumRole {
  return PIECE_TO_ROLE[piece];
}
