import {parseChartFile, NoteEvent} from '@eliwhite/scan-chart';
import {pieceFromChartNote, type DrumPiece} from '@/lib/drums/pieces';

type ParsedChart = ReturnType<typeof parseChartFile>;
type TimeSignature = ParsedChart['timeSignatures'][0];

/** The canonical drum vocabulary now lives in src/lib/drums/pieces.ts. */
export type DrumNoteInstrument = DrumPiece;

type InstrumentMapping = {
  [key in DrumNoteInstrument]: string;
};

export const mapping: InstrumentMapping = {
  kick: 'e/4',
  snare: 'c/5',
  hihat: 'g/5/x2',
  ride: 'f/5/x2',
  crash: 'a/5/x2',
  'high-tom': 'e/5',
  'mid-tom': 'd/5',
  'floor-tom': 'a/4',
};

export interface Measure {
  timeSig: TimeSignature;
  sigChange: boolean;
  hasClef: boolean;
  notes: Note[];
  beats: Beat[];
  startTick: number;
  endTick: number;
  durationTicks?: number;
  startMs: number;
  endMs: number;
}

export interface Beat {
  notes: Note[];
  startTick: number;
  endTick: number;
}

export interface Note {
  notes: string[];
  dotted: boolean;
  duration: string;
  isTriplet: boolean;
  isRest: boolean;
  tick: number;
  ms: number;
  durationTicks?: number;
}

export interface Duration {
  duration?: string;
  isTriplet?: boolean;
  dotted?: boolean;
}

/**
 * Map a NoteEvent from scan-chart to a DrumNoteInstrument.
 *
 * Delegates to the shared vocabulary in src/lib/drums/pieces.ts. The fallback
 * to 'snare' only fires for a note type that is not a drum at all; scan-chart
 * always resolves lanes 2-4 to exactly one of tom/cymbal for a pro chart.
 */
export function convertNoteToDrumInstrument(note: NoteEvent): DrumNoteInstrument {
  return pieceFromChartNote(note) ?? 'snare';
}
