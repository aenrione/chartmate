/**
 * AlphaTab Score (i.e. a Guitar Pro file) → ChartDocument.
 *
 * The note stream comes from AlphaTab's own `MidiFileGenerator` rather than
 * from walking the Score: it resolves repeats, alternate endings, tempo
 * automations and grace-beat tick shifts for us, and it resolves a GP note's
 * `percussionArticulation` — which is an INDEX into
 * `track.percussionArticulations`, not a MIDI number — into the real MIDI key
 * via `.outputMidiNumber`, including GP7's fallback articulation table for
 * tracks that list none of their own.
 */

import {midi, model, Settings} from '@coderline/alphatab';
import {pieceFromGm, PIECE_TO_LANE} from '@/lib/drums/pieces';
import {
  ALPHATAB_RESOLUTION,
  CHART_RESOLUTION,
  type ChartDifficulty,
  type ChartDocument,
  type ChartNote,
  type ChartTempo,
  type ChartTimeSignature,
} from './types';

type Score = InstanceType<typeof model.Score>;

/** AlphaTab is 960 ticks per quarter, `.chart` is 192. Exact, no rounding. */
const TICK_DIVISOR = ALPHATAB_RESOLUTION / CHART_RESOLUTION; // 5

const PERCUSSION_CHANNEL = 9;

export interface ScoreToChartOptions {
  /** Score track index. Defaults to the first percussion track. */
  trackIndex?: number;
  charter?: string;
  difficulty?: ChartDifficulty;
  /** Extra fields for the chart's [Song] block. */
  song?: Partial<ChartDocument['song']>;
}

export interface ScoreToChartResult {
  doc: ChartDocument;
  /** GM notes with no lane, counted. Empty when nothing was lost. */
  dropped: Record<number, number>;
  /** Total length in milliseconds, for song.ini. */
  lengthMs: number;
  /**
   * Grace-beat tick shift AlphaTab applied, in chart ticks. Non-zero means
   * bar 1 does not start at tick 0.
   */
  tickShift: number;
}

interface RawNote {
  tick: number;
  key: number;
  velocity: number;
}

class DrumEventCollector implements midi.IMidiFileHandler {
  readonly notes: RawNote[] = [];
  readonly tempos: ChartTempo[] = [];
  readonly timeSignatures: ChartTimeSignature[] = [];
  tickShift = 0;

  // A plain field, not a parameter property: Node runs this file through
  // type stripping for the CLI, and that cannot rewrite `private x` in a
  // constructor signature.
  private readonly trackIndex: number;

  constructor(trackIndex: number) {
    this.trackIndex = trackIndex;
  }

  addTickShift(tickShift: number): void {
    this.tickShift = tickShift;
  }

  addNote(
    track: number,
    start: number,
    _length: number,
    key: number,
    velocity: number,
    channel: number,
  ): void {
    if (track !== this.trackIndex || channel !== PERCUSSION_CHANNEL) return;
    this.notes.push({tick: start + this.tickShift, key, velocity});
  }

  addTempo(tick: number, tempo: number): void {
    this.tempos.push({tick: tick + this.tickShift, bpm: tempo});
  }

  addTimeSignature(tick: number, numerator: number, denominator: number): void {
    this.timeSignatures.push({
      tick: tick + this.tickShift,
      numerator,
      denominator,
    });
  }

  // Nothing below carries information a drum chart can express.
  addRest(): void {}
  addControlChange(): void {}
  addProgramChange(): void {}
  addNoteBend(): void {}
  addBend(): void {}
  finishTrack(): void {}
}

/** The score's first percussion track, or null if it has none. */
export function findPercussionTrack(score: Score) {
  return (
    score.tracks.find(
      t =>
        t.staves.some(s => s.isPercussion) ||
        t.playbackInfo.primaryChannel === PERCUSSION_CHANNEL,
    ) ?? null
  );
}

/** Whether this score has anything a drum chart could be made of. */
export function hasPercussionTrack(score: Score): boolean {
  return findPercussionTrack(score) !== null;
}

function findPercussionTrackIndex(score: Score): number {
  const track = findPercussionTrack(score);
  if (!track) throw new Error('Score has no percussion track to export');
  return track.index;
}

/** Collapse consecutive duplicates, keeping the first at each tick. */
function dedupe<T extends {tick: number}>(
  events: T[],
  same: (a: T, b: T) => boolean,
): T[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const result: T[] = [];
  for (const event of sorted) {
    const previous = result[result.length - 1];
    if (previous && previous.tick === event.tick) {
      result[result.length - 1] = event;
      continue;
    }
    if (previous && same(previous, event)) continue;
    result.push(event);
  }
  return result;
}

function toChartTick(alphaTick: number): number {
  return Math.round(alphaTick / TICK_DIVISOR);
}

/**
 * Velocity is AlphaTab's only channel for note dynamics here, and it is
 * `15 + 16 * (dynamic + adjustment)` where an accent adds one step and a ghost
 * subtracts one. Comparing against the track's own modal velocity — rather
 * than an absolute threshold — makes this work for a track written at mp just
 * as well as one written at f.
 */
function classifyDynamics(velocities: number[]): (velocity: number) => {
  accent: boolean;
  ghost: boolean;
} {
  const counts = new Map<number, number>();
  for (const v of velocities) counts.set(v, (counts.get(v) ?? 0) + 1);
  let mode = 0;
  let best = -1;
  for (const [velocity, count] of counts) {
    if (count > best || (count === best && velocity < mode)) {
      best = count;
      mode = velocity;
    }
  }
  return (velocity: number) => ({
    accent: velocity > mode,
    ghost: velocity < mode,
  });
}

function millisecondsAt(tempos: ChartTempo[], tick: number, resolution: number): number {
  let ms = 0;
  let cursor = 0;
  let bpm = tempos[0]?.bpm ?? 120;
  for (const tempo of tempos) {
    if (tempo.tick >= tick) break;
    ms += ((tempo.tick - cursor) / resolution) * (60000 / bpm);
    cursor = tempo.tick;
    bpm = tempo.bpm;
  }
  ms += ((tick - cursor) / resolution) * (60000 / bpm);
  return ms;
}

export function scoreToChartDocument(
  score: Score,
  options: ScoreToChartOptions = {},
): ScoreToChartResult {
  const trackIndex = options.trackIndex ?? findPercussionTrackIndex(score);
  const difficulty = options.difficulty ?? 'Expert';

  const collector = new DrumEventCollector(trackIndex);
  const generator = new midi.MidiFileGenerator(score, new Settings(), collector);
  generator.generate();

  const classify = classifyDynamics(collector.notes.map(n => n.velocity));

  const dropped: Record<number, number> = {};
  const byTick = new Map<number, ChartNote[]>();

  for (const raw of [...collector.notes].sort((a, b) => a.tick - b.tick)) {
    const piece = pieceFromGm(raw.key);
    if (!piece) {
      dropped[raw.key] = (dropped[raw.key] ?? 0) + 1;
      continue;
    }
    const tick = toChartTick(raw.tick);
    const {accent, ghost} = classify(raw.velocity);
    const isKick = PIECE_TO_LANE[piece].lane === 0;
    const note: ChartNote = {
      tick,
      piece,
      // Dynamics have no kick lane in the format.
      ...(isKick ? {} : {accent, ghost}),
    };

    const atTick = byTick.get(tick) ?? [];
    // Two articulations that fold to the same piece (say a china and a splash
    // struck together) would otherwise emit a duplicate note on one lane.
    if (atTick.some(n => n.piece === piece)) continue;
    atTick.push(note);
    byTick.set(tick, atTick);
  }

  const notes = [...byTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, group]) => group);

  const tempos = dedupe(
    collector.tempos.map(t => ({tick: toChartTick(t.tick), bpm: t.bpm})),
    (a, b) => a.bpm === b.bpm,
  );
  if (tempos.length === 0 || tempos[0].tick !== 0) {
    tempos.unshift({tick: 0, bpm: score.tempo || 120});
  }

  const timeSignatures = dedupe(
    collector.timeSignatures.map(ts => ({
      tick: toChartTick(ts.tick),
      numerator: ts.numerator,
      denominator: ts.denominator,
    })),
    (a, b) => a.numerator === b.numerator && a.denominator === b.denominator,
  );
  if (timeSignatures.length === 0 || timeSignatures[0].tick !== 0) {
    timeSignatures.unshift({tick: 0, numerator: 4, denominator: 4});
  }

  // Sections come from the tick lookup rather than score.masterBars so that a
  // section inside a repeated block is emitted once per repetition.
  const sections: {tick: number; name: string}[] = [];
  for (const lookup of generator.tickLookup.masterBars) {
    const text = lookup.masterBar.section?.text;
    if (text) {
      sections.push({tick: toChartTick(lookup.start + collector.tickShift), name: text});
    }
  }

  const endTick = generator.tickLookup.masterBars.length
    ? toChartTick(
        generator.tickLookup.masterBars[generator.tickLookup.masterBars.length - 1].end +
          collector.tickShift,
      )
    : (notes[notes.length - 1]?.tick ?? 0);

  const doc: ChartDocument = {
    resolution: CHART_RESOLUTION,
    song: {
      name: score.title || 'Untitled',
      artist: score.artist || '',
      charter: options.charter ?? 'Chartmate',
      album: score.album || undefined,
      musicStream: 'song.ogg',
      offset: 0,
      ...options.song,
    },
    tempos,
    timeSignatures,
    sections,
    notes: {[difficulty]: notes},
    droppedPercussion: Object.keys(dropped).length ? dropped : undefined,
  };

  return {
    doc,
    dropped,
    lengthMs: millisecondsAt(tempos, endTick, CHART_RESOLUTION),
    tickShift: toChartTick(collector.tickShift),
  };
}
