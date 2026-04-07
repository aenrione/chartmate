import {parseChartFile, noteTypes, noteFlags, NoteEvent} from '@eliwhite/scan-chart';

type ParsedChart = ReturnType<typeof parseChartFile>;
type TimeSignature = ParsedChart['timeSignatures'][0];

export type DrumNoteInstrument =
  | 'kick'
  | 'snare'
  | 'high-tom'
  | 'mid-tom'
  | 'floor-tom'
  | 'hihat'
  | 'crash'
  | 'ride';

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
 * Uses fallback defaults for ambiguous flag combinations rather than throwing.
 */
export function convertNoteToDrumInstrument(note: NoteEvent): DrumNoteInstrument {
  switch (note.type) {
    case noteTypes.kick:
      return 'kick';
    case noteTypes.redDrum:
      return 'snare';
    case noteTypes.yellowDrum:
      if (note.flags & noteFlags.cymbal) {
        return 'hihat';
      } else if (note.flags & noteFlags.tom) {
        return 'high-tom';
      }
      return 'hihat';
    case noteTypes.blueDrum:
      if (note.flags & noteFlags.cymbal) {
        return 'ride';
      } else if (note.flags & noteFlags.tom) {
        return 'mid-tom';
      }
      return 'ride';
    case noteTypes.greenDrum:
      if (note.flags & noteFlags.cymbal) {
        return 'crash';
      } else if (note.flags & noteFlags.tom) {
        return 'floor-tom';
      }
      return 'crash';
    default:
      return 'snare';
  }
}
