/**
 * Serialises a ChartDocument to `.chart` text.
 *
 * Hand-written on purpose: upstream Geomitron/scan-chart has no writer. The
 * `writeChartFile` / `writeChartFolder` pull requests (#101, #109) are both
 * closed unmerged, `main` contains only parsers, and the published
 * `scan-chart@8.0.1` exports no `write*` symbol at all — besides pulling
 * node-only dependencies (fluent-ffmpeg, workerpool) that the `@eliwhite`
 * fork exists to avoid.
 *
 * `.chart` has NO comment syntax. The `//` seen in every published example is
 * documentation around the format, not part of it. Nothing here emits one.
 */

import {PIECE_TO_LANE} from '@/lib/drums/pieces';
import type {
  ChartDifficulty,
  ChartDocument,
  ChartNote,
  ChartPhrase,
} from './types';

const DIFFICULTY_ORDER: ChartDifficulty[] = ['Expert', 'Hard', 'Medium', 'Easy'];

/** `N 32` — the second kick pedal. */
const DOUBLE_KICK = 32;
/** Cymbal markers: 66 yellow, 67 blue, 68 green. */
const CYMBAL_MARKER_BASE = 64;
/** Accents: 34 red … 38 lane-5. */
const ACCENT_BASE = 33;
/** Ghosts: 40 red … 44 lane-5. */
const GHOST_BASE = 39;
/** `S 2` — star power. */
const STAR_POWER = 2;

/**
 * POLARITY, the one that silently corrupts output:
 *
 *   in `.chart`  a bare lane is a TOM,    and 66/67/68 promote it to a CYMBAL
 *   in `.mid`    a bare lane is a CYMBAL, and 110/111/112 demote it to a TOM
 *
 * This writer emits `.chart`, so it writes a marker for the pieces whose
 * `PIECE_TO_LANE[...].cymbal` is true and writes nothing for the toms.
 */
function cymbalMarker(lane: number): number {
  return CYMBAL_MARKER_BASE + lane;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, "'")}"`;
}

function section(name: string, body: string[]): string[] {
  return [`[${name}]`, '{', ...body.map(line => `  ${line}`), '}'];
}

function songSection(doc: ChartDocument): string[] {
  const {song} = doc;
  const lines = [
    `Name = ${quote(song.name)}`,
    `Artist = ${quote(song.artist)}`,
  ];
  if (song.album) lines.push(`Album = ${quote(song.album)}`);
  if (song.year) lines.push(`Year = ${quote(song.year)}`);
  lines.push(`Charter = ${quote(song.charter)}`);
  // Leading silence in the audio is the sync mechanism, so the chart never
  // carries an offset of its own.
  lines.push(`Offset = ${song.offset ?? 0}`);
  lines.push(`Resolution = ${doc.resolution}`);
  lines.push(`Player2 = bass`);
  lines.push(`Difficulty = ${song.difficulty ?? 0}`);
  lines.push(`PreviewStart = ${song.previewStart ?? 0}`);
  lines.push(`PreviewEnd = ${song.previewEnd ?? 0}`);
  if (song.genre) lines.push(`Genre = ${quote(song.genre)}`);
  lines.push(`MediaType = ${quote('cd')}`);
  if (song.musicStream) lines.push(`MusicStream = ${quote(song.musicStream)}`);
  return section('Song', lines);
}

function syncTrackSection(doc: ChartDocument): string[] {
  type Entry = {tick: number; rank: number; text: string};
  const entries: Entry[] = [];

  for (const ts of doc.timeSignatures) {
    const exponent = Math.log2(ts.denominator);
    if (!Number.isInteger(exponent)) {
      throw new Error(
        `Time signature denominator must be a power of 2, got ${ts.denominator}`,
      );
    }
    // The exponent is omitted when it is 2 (i.e. /4), which is the common case.
    const suffix = exponent === 2 ? '' : ` ${exponent}`;
    entries.push({tick: ts.tick, rank: 0, text: `TS ${ts.numerator}${suffix}`});
  }

  for (const tempo of doc.tempos) {
    // Milli-BPM: 120 BPM is written as 120000.
    entries.push({
      tick: tempo.tick,
      rank: 1,
      text: `B ${Math.round(tempo.bpm * 1000)}`,
    });
  }

  entries.sort((a, b) => a.tick - b.tick || a.rank - b.rank);
  return section('SyncTrack', entries.map(e => `${e.tick} = ${e.text}`));
}

function eventsSection(doc: ChartDocument): string[] {
  const lines = [...doc.sections]
    .sort((a, b) => a.tick - b.tick)
    .map(s => `${s.tick} = E ${quote(`section ${s.name}`)}`);
  return section('Events', lines);
}

function noteLines(notes: ChartNote[], phrases: ChartPhrase[]): string[] {
  type Entry = {tick: number; rank: number; key: number; text: string};
  const entries: Entry[] = [];

  const push = (tick: number, rank: number, key: number, text: string) =>
    entries.push({tick, rank, key, text});

  for (const note of notes) {
    const {lane, cymbal} = PIECE_TO_LANE[note.piece];
    const length = note.length ?? 0;
    const isKick = lane === 0;
    const chartLane = isKick && note.doubleKick ? DOUBLE_KICK : lane;

    push(note.tick, 0, chartLane, `N ${chartLane} ${length}`);

    if (cymbal) {
      push(note.tick, 1, lane, `N ${cymbalMarker(lane)} 0`);
    }
    // Dynamics apply to the pads only; a kick has neither an accent nor a
    // ghost lane in the format.
    if (!isKick && note.accent) {
      push(note.tick, 2, lane, `N ${ACCENT_BASE + lane} 0`);
    }
    if (!isKick && note.ghost) {
      push(note.tick, 2, lane, `N ${GHOST_BASE + lane} 0`);
    }
  }

  for (const phrase of phrases) {
    push(phrase.tick, 3, 0, `S ${STAR_POWER} ${phrase.length}`);
  }

  entries.sort(
    (a, b) => a.tick - b.tick || a.rank - b.rank || a.key - b.key,
  );
  return entries.map(e => `${e.tick} = ${e.text}`);
}

export function writeChart(doc: ChartDocument): string {
  const blocks: string[][] = [
    songSection(doc),
    syncTrackSection(doc),
    eventsSection(doc),
  ];

  for (const difficulty of DIFFICULTY_ORDER) {
    const notes = doc.notes[difficulty];
    if (!notes || notes.length === 0) continue;
    // Star power lives on the chart as a whole here; every written difficulty
    // gets the same phrases, which is what charters do by hand anyway.
    blocks.push(
      section(`${difficulty}Drums`, noteLines(notes, doc.starPower ?? [])),
    );
  }

  // Clone Hero and Moonscraper both expect CRLF; YARG accepts either.
  return blocks.map(b => b.join('\r\n')).join('\r\n') + '\r\n';
}
