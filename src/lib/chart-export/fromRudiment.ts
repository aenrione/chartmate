/**
 * A rudiment's sticking string → ChartDocument.
 *
 * The sticking grammar used in src/pages/rudiments/rudimentData.ts:
 *   R  L      a stroke
 *   lR rL     a flam  — one grace note before the stroke
 *   llR rrL   a drag  — two grace notes before the stroke
 *   zz        a multiple-bounce (buzz) stroke
 *   ·         a phrase divider, not a note
 *
 * COLLAPSES, both intentional:
 *
 * 1. `.chart` has no grace notes. A flam's and a drag's grace strokes are
 *    emitted as real notes just before the main one, marked as ghosts. They
 *    are audibly and visually a flam in-game; they are not grace notes in the
 *    notation sense, and they will not round-trip back into one.
 * 2. A buzz stroke's individual bounces are not chartable at all. `zz` becomes
 *    a single stroke.
 */

import {
  CHART_RESOLUTION,
  type ChartDocument,
  type ChartNote,
} from './types';
import {DEFAULT_BPM, MIN_LEAD_IN_MS} from './fromDrumPattern';
import {BROKEN_NOTE_MS} from './validate';

export type Subdivision = '32nd' | '16th' | 'triplet' | '8th' | 'quarter';

/** Ticks between consecutive strokes, at 192 PPQ. */
export const SUBDIVISION_TICKS: Record<Subdivision, number> = {
  '32nd': 24,
  '16th': 48,
  triplet: 64, // triplet eighths: 192 / 3
  '8th': 96,
  quarter: 192,
};

const TICKS_PER_BAR_4_4 = CHART_RESOLUTION * 4;

interface Stroke {
  /** Number of grace strokes preceding the main one. */
  graces: number;
  buzz: boolean;
}

export function parseSticking(sticking: string): Stroke[] {
  const tokens = sticking.split(/[\s·]+/).filter(Boolean);
  return tokens.map(token => {
    if (/^z+$/i.test(token)) return {graces: 0, buzz: true};
    const match = /^([lr]*)[RL]$/.exec(token);
    if (!match) {
      throw new Error(`Unrecognised sticking token "${token}" in "${sticking}"`);
    }
    return {graces: match[1].length, buzz: false};
  });
}

export interface RudimentToChartOptions {
  name: string;
  sticking: string;
  subdivision?: Subdivision;
  bpm?: number;
  /** How many times to play the pattern. Defaults to filling 8 bars. */
  repeats?: number;
  charter?: string;
  musicStream?: string;
}

export interface RudimentToChartResult {
  doc: ChartDocument;
  lengthMs: number;
  strokes: number;
  /**
   * True when the tempo left no room for a flam's or drag's grace strokes and
   * they were left out rather than written close enough to read as a charting
   * mistake. The main strokes are all there.
   */
  gracesDropped: boolean;
}

/** Comfortably clear of scan-chart's 15 ms brokenNote threshold. */
const MIN_GRACE_GAP_MS = BROKEN_NOTE_MS * 2;

export function rudimentToChartDocument(
  options: RudimentToChartOptions,
): RudimentToChartResult {
  const subdivision = options.subdivision ?? '16th';
  const bpm = options.bpm ?? DEFAULT_BPM;
  const step = SUBDIVISION_TICKS[subdivision];
  const strokes = parseSticking(options.sticking);
  if (strokes.length === 0) throw new Error(`Rudiment "${options.name}" has no strokes`);

  const patternTicks = strokes.length * step;
  const repeats =
    options.repeats ?? Math.max(1, Math.ceil((TICKS_PER_BAR_4_4 * 8) / patternTicks));

  const msPerBar = (TICKS_PER_BAR_4_4 / CHART_RESOLUTION) * (60000 / bpm);
  const leadInBars = Math.max(1, Math.ceil(MIN_LEAD_IN_MS / msPerBar));
  const start = leadInBars * TICKS_PER_BAR_4_4;

  // Keep the grace strokes clear of each other and of the main stroke, never
  // finer than a 64th note, and — the part that bites at high tempo — never
  // closer in real time than scan-chart's brokenNote threshold. At 240 BPM a
  // 64th is under 8 ms, which Clone Hero would read as a charting mistake.
  const msPerTick = 60000 / bpm / CHART_RESOLUTION;
  const graceStep = Math.max(
    Math.min(CHART_RESOLUTION / 8, Math.floor(step / 4)),
    Math.ceil(MIN_GRACE_GAP_MS / msPerTick),
    1,
  );
  const maxGraces = Math.max(0, ...strokes.map(s => s.graces));
  // If they no longer fit before the stroke they belong to, the honest move is
  // to leave them out and say so.
  const graceFits = maxGraces === 0 || graceStep * maxGraces < step;

  const notes: ChartNote[] = [];
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (let i = 0; i < strokes.length; i++) {
      const tick = start + repeat * patternTicks + i * step;
      const stroke = strokes[i];
      for (let g = graceFits ? stroke.graces : 0; g > 0; g--) {
        notes.push({tick: tick - g * graceStep, piece: 'snare', ghost: true});
      }
      notes.push({tick, piece: 'snare'});
    }
  }
  notes.sort((a, b) => a.tick - b.tick);

  const endTick = start + repeats * patternTicks;

  return {
    doc: {
      resolution: CHART_RESOLUTION,
      song: {
        name: options.name,
        artist: 'Rudiments',
        album: 'PAS 40 International Drum Rudiments',
        genre: 'Practice',
        charter: options.charter ?? 'Chartmate',
        offset: 0,
        musicStream: options.musicStream ?? 'song.ogg',
      },
      tempos: [{tick: 0, bpm}],
      timeSignatures: [{tick: 0, numerator: 4, denominator: 4}],
      sections: [{tick: start, name: options.name}],
      notes: {Expert: notes},
    },
    lengthMs: (endTick / CHART_RESOLUTION) * (60000 / bpm),
    strokes: notes.length,
    gracesDropped: maxGraces > 0 && !graceFits,
  };
}
