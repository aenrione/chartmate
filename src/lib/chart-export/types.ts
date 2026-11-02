import type {DrumPiece} from '@/lib/drums/pieces';

/** `.chart` convention. AlphaTab is 960; 960 / 5 = 192, exact. */
export const CHART_RESOLUTION = 192;
export const ALPHATAB_RESOLUTION = 960;

export type ChartDifficulty = 'Expert' | 'Hard' | 'Medium' | 'Easy';

export interface ChartNote {
  tick: number;
  piece: DrumPiece;
  /** Kick only. Emits `N 32` (the second kick pedal) instead of `N 0`. */
  doubleKick?: boolean;
  accent?: boolean;
  ghost?: boolean;
  /** Sustain in ticks. Drums are hits, so this is 0 unless something says otherwise. */
  length?: number;
}

export interface ChartTempo {
  tick: number;
  /** Real BPM. Serialised as milli-BPM. */
  bpm: number;
}

export interface ChartTimeSignature {
  tick: number;
  numerator: number;
  /** The real denominator (4, 8, 16). Serialised as its log2 exponent. */
  denominator: number;
}

export interface ChartPhrase {
  tick: number;
  length: number;
}

export interface ChartSongMeta {
  name: string;
  artist: string;
  charter: string;
  album?: string;
  year?: string;
  genre?: string;
  /** Seconds of leading silence to skip. Always 0 here — see writeSongIni. */
  offset?: number;
  previewStart?: number;
  previewEnd?: number;
  /** Filename of the audio stem, e.g. "song.ogg". */
  musicStream?: string;
  difficulty?: number;
}

export interface ChartDocument {
  resolution: number;
  song: ChartSongMeta;
  tempos: ChartTempo[];
  timeSignatures: ChartTimeSignature[];
  sections: {tick: number; name: string}[];
  /** `S 2` phrases on the drum track. */
  starPower?: ChartPhrase[];
  notes: Partial<Record<ChartDifficulty, ChartNote[]>>;
  /**
   * GM notes that had no lane and were discarded, counted by note number.
   * Carried on the document so callers can report the loss instead of
   * discovering it in Clone Hero.
   */
  droppedPercussion?: Record<number, number>;
}
