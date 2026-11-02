/**
 * Grid patterns (curriculum `drum-pattern` activities, and rudiments) →
 * ChartDocument.
 *
 * The grid semantics deliberately mirror
 * src/pages/learn/activities/DrumPatternActivity.tsx exactly — `subdivisions`
 * is a cells-per-beat figure of `subdivisions / 4`, and a pattern shorter than
 * the bar is padded with rests, longer is trimmed — so the exported chart is
 * the same thing the lesson shows on screen, not a reinterpretation of it.
 */

import type {DrumPiece} from '@/lib/drums/pieces';
import {
  CHART_RESOLUTION,
  type ChartDocument,
  type ChartNote,
  type ChartTempo,
} from './types';

export interface PatternTrack {
  name: string;
  /** `x` hit, `X` accent, `o` ghost, `-` rest. */
  pattern: string;
}

export interface PatternBlock {
  title: string;
  /** "4/4", "6/8", … Defaults to 4/4. */
  timeSignature?: string;
  /** 8 = eighth grid, 16 = sixteenth grid. Defaults to 8. */
  subdivisions?: number;
  bpm?: number;
  tracks: PatternTrack[];
  /** How many times to play the block. Defaults to DEFAULT_REPEATS. */
  repeats?: number;
}

export const DEFAULT_REPEATS = 4;
export const DEFAULT_BPM = 90;
/** Encore warns below 2000 ms of leading silence, so we clear that. */
export const MIN_LEAD_IN_MS = 2500;

/**
 * Track name → piece. The curriculum only uses five names (Snare, Kick,
 * Hi-Hat, Ride, Clave) but rudiments and user lessons can use more, so the
 * match is on substrings and the unmatched are reported rather than guessed.
 */
export function pieceForTrackName(name: string): DrumPiece | null {
  const n = name.toLowerCase();
  if (n.includes('kick') || n.includes('bass')) return 'kick';
  if (n.includes('snare') || n.includes('rim') || n.includes('stick')) return 'snare';
  if (n.includes('hat') || n.includes('hh')) return 'hihat';
  if (n.includes('ride')) return 'ride';
  if (n.includes('crash') || n.includes('china') || n.includes('splash')) return 'crash';
  if (n.includes('floor') || n.includes('low tom')) return 'floor-tom';
  if (n.includes('mid')) return 'mid-tom';
  if (n.includes('tom')) return 'high-tom';
  // Same fold as GM 56/75 in pieces.ts: a clave or cowbell line is real music,
  // so it goes to the yellow tom rather than being dropped.
  if (n.includes('cowbell') || n.includes('clave') || n.includes('block')) return 'high-tom';
  return null;
}

function parseTimeSignature(value: string | undefined): [number, number] {
  const [num, den] = (value ?? '4/4').split('/').map(v => parseInt(v, 10));
  if (!num || !den) return [4, 4];
  if (!Number.isInteger(Math.log2(den))) {
    throw new Error(`Time signature denominator must be a power of 2, got ${den}`);
  }
  return [num, den];
}

interface BlockLayout {
  ticksPerBar: number;
  tickPerCell: number;
  cellsPerBar: number;
  numerator: number;
  denominator: number;
}

function layoutOf(block: PatternBlock): BlockLayout {
  const [numerator, denominator] = parseTimeSignature(block.timeSignature);
  const subdivisions = block.subdivisions ?? 8;
  const cellsPerBeat = subdivisions / 4;
  const ticksPerBeat = (CHART_RESOLUTION * 4) / denominator;
  return {
    numerator,
    denominator,
    ticksPerBar: ticksPerBeat * numerator,
    tickPerCell: ticksPerBeat / cellsPerBeat,
    cellsPerBar: numerator * cellsPerBeat,
  };
}

export interface PatternsToChartOptions {
  name: string;
  artist?: string;
  charter?: string;
  album?: string;
  genre?: string;
  /** Bars of silence before the first note. Defaults to enough for MIN_LEAD_IN_MS. */
  leadInBars?: number;
  musicStream?: string;
}

export interface PatternsToChartResult {
  doc: ChartDocument;
  lengthMs: number;
  /** Track names that matched no piece and were skipped. */
  unmappedTracks: string[];
}

export function patternsToChartDocument(
  blocks: PatternBlock[],
  options: PatternsToChartOptions,
): PatternsToChartResult {
  if (blocks.length === 0) {
    throw new Error('Nothing to export: no patterns');
  }

  const unmapped = new Set<string>();
  const notes: ChartNote[] = [];
  const sections: {tick: number; name: string}[] = [];
  const tempos: ChartTempo[] = [];
  const timeSignatures: ChartDocument['timeSignatures'] = [];

  const firstBpm = blocks[0].bpm ?? DEFAULT_BPM;
  const firstLayout = layoutOf(blocks[0]);
  const leadInBars =
    options.leadInBars ??
    Math.max(
      1,
      Math.ceil(
        MIN_LEAD_IN_MS /
          ((firstLayout.ticksPerBar / CHART_RESOLUTION) * (60000 / firstBpm)),
      ),
    );

  tempos.push({tick: 0, bpm: firstBpm});
  timeSignatures.push({
    tick: 0,
    numerator: firstLayout.numerator,
    denominator: firstLayout.denominator,
  });

  let tick = leadInBars * firstLayout.ticksPerBar;

  for (const block of blocks) {
    const layout = layoutOf(block);
    const bpm = block.bpm ?? DEFAULT_BPM;
    const repeats = block.repeats ?? DEFAULT_REPEATS;

    const last = <T,>(list: T[]): T => list[list.length - 1];
    if (last(tempos).bpm !== bpm) tempos.push({tick, bpm});
    const previousTs = last(timeSignatures);
    if (
      previousTs.numerator !== layout.numerator ||
      previousTs.denominator !== layout.denominator
    ) {
      timeSignatures.push({
        tick,
        numerator: layout.numerator,
        denominator: layout.denominator,
      });
    }

    sections.push({tick, name: block.title});

    const lanes = block.tracks
      .map(track => {
        const piece = pieceForTrackName(track.name);
        if (!piece) {
          unmapped.add(track.name);
          return null;
        }
        return {
          piece,
          cells: track.pattern
            .replace(/\s/g, '')
            .slice(0, layout.cellsPerBar)
            .padEnd(layout.cellsPerBar, '-'),
        };
      })
      .filter((v): v is {piece: DrumPiece; cells: string} => v !== null);

    for (let repeat = 0; repeat < repeats; repeat++) {
      const barStart = tick + repeat * layout.ticksPerBar;
      for (const lane of lanes) {
        for (let cell = 0; cell < lane.cells.length; cell++) {
          const char = lane.cells[cell];
          if (char === '-' || char === '.') continue;
          notes.push({
            tick: barStart + cell * layout.tickPerCell,
            piece: lane.piece,
            accent: char === 'X',
            ghost: char === 'o',
          });
        }
      }
    }

    tick += repeats * layout.ticksPerBar;
  }

  notes.sort((a, b) => a.tick - b.tick);

  const doc: ChartDocument = {
    resolution: CHART_RESOLUTION,
    song: {
      name: options.name,
      artist: options.artist ?? 'Chartmate',
      charter: options.charter ?? 'Chartmate',
      album: options.album,
      genre: options.genre ?? 'Practice',
      offset: 0,
      musicStream: options.musicStream ?? 'song.ogg',
    },
    tempos,
    timeSignatures,
    sections,
    notes: {Expert: notes},
  };

  return {
    doc,
    lengthMs: millisecondsAt(tempos, tick),
    unmappedTracks: [...unmapped],
  };
}

function millisecondsAt(tempos: ChartTempo[], tick: number): number {
  let ms = 0;
  let cursor = 0;
  let bpm = tempos[0]?.bpm ?? DEFAULT_BPM;
  for (const tempo of tempos) {
    if (tempo.tick >= tick) break;
    ms += ((tempo.tick - cursor) / CHART_RESOLUTION) * (60000 / bpm);
    cursor = tempo.tick;
    bpm = tempo.bpm;
  }
  ms += ((tick - cursor) / CHART_RESOLUTION) * (60000 / bpm);
  return ms;
}
