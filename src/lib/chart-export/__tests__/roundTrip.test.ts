/**
 * The round trip:
 *
 *   Score (GP) → scoreToChartDocument → writeChart → .chart text
 *               → parseChartFile → convertToAlphaTabDrums → Score
 *
 * Anything that does not survive is either a bug or one of the documented
 * collapses in src/lib/drums/pieces.ts. The test pins both.
 */

import {describe, it, expect} from 'vitest';
import {parseChartFile} from '@eliwhite/scan-chart';
import {model} from '@coderline/alphatab';
import convertToAlphaTabDrums from '@/pages/sheet-music/convertToAlphaTabDrums';
import {createDrumsDemo} from '@/lib/tab-editor/examples/drums-demo';
import {createGuitarDemo} from '@/lib/tab-editor/examples/guitar-demo';
import {pieceFromGm, type DrumPiece} from '@/lib/drums/pieces';
import {hasPercussionTrack, scoreToChartDocument} from '../fromScore';
import {buildScoreFolder} from '../presets';
import {writeChart} from '../writeChart';
import {ALPHATAB_RESOLUTION, CHART_RESOLUTION} from '../types';

type Score = InstanceType<typeof model.Score>;

const TICK_DIVISOR = ALPHATAB_RESOLUTION / CHART_RESOLUTION;

interface Hit {
  tick: number;
  piece: DrumPiece;
}

/** Every percussion note in a Score, as (chart tick, piece), sorted. */
function hitsOf(score: Score): Hit[] {
  const hits: Hit[] = [];
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            for (const note of beat.notes) {
              const piece = pieceFromGm(note.percussionArticulation);
              if (!piece) continue;
              hits.push({
                tick: Math.round(beat.absolutePlaybackStart / TICK_DIVISOR),
                piece,
              });
            }
          }
        }
      }
    }
  }
  return sortHits(hits);
}

function sortHits(hits: Hit[]): Hit[] {
  return [...hits].sort((a, b) => a.tick - b.tick || a.piece.localeCompare(b.piece));
}

function roundTrip(text: string): Score {
  const chart = parseChartFile(new TextEncoder().encode(text), 'chart', {
    // Without this the chart is read as plain four-lane and every pad comes
    // back a tom, regardless of the cymbal markers we wrote.
    pro_drums: true,
  });
  const track = chart.trackData.find(
    t => t.instrument === 'drums' && t.difficulty === 'expert',
  );
  if (!track) throw new Error('round trip lost the drums track');
  return convertToAlphaTabDrums(chart, track);
}

describe('GP drum track → .chart → GP drum track', () => {
  const source = createDrumsDemo();
  const {doc, dropped, lengthMs} = scoreToChartDocument(source);
  const text = writeChart(doc);
  const result = roundTrip(text);

  it('drops nothing from a standard kit', () => {
    expect(dropped).toEqual({});
  });

  it('reports a plausible song length', () => {
    // 8 bars of 4/4 at 120 BPM = 16 seconds.
    expect(lengthMs).toBeCloseTo(16000, -2);
  });

  it('preserves tempo and time signature', () => {
    expect(doc.tempos).toEqual([{tick: 0, bpm: 120}]);
    expect(doc.timeSignatures).toEqual([
      {tick: 0, numerator: 4, denominator: 4},
    ]);
  });

  it('preserves every hit on tick and piece', () => {
    const expected = sortHits(
      doc.notes.Expert!.map(n => ({tick: n.tick, piece: n.piece})),
    );
    expect(hitsOf(result)).toEqual(expected);
  });

  it('keeps toms and cymbals on the right side of the polarity', () => {
    const pieces = new Set(hitsOf(result).map(h => h.piece));
    // The demo plays all three toms, the hi-hat, the ride and a crash. If the
    // 66/67/68 polarity were inverted these would come back as the opposite
    // kind on each lane.
    expect(pieces).toContain('high-tom');
    expect(pieces).toContain('mid-tom');
    expect(pieces).toContain('floor-tom');
    expect(pieces).toContain('hihat');
    expect(pieces).toContain('ride');
    expect(pieces).toContain('crash');
  });

  it('folds the open hi-hat into the closed one — a documented collapse', () => {
    // drums-demo bar 3 plays MIDI 46 (open hi-hat); .chart has no lane for
    // openness, so it must come back as a plain hi-hat and not vanish.
    const sourceHas46 = source.tracks.some(t =>
      t.staves.some(s =>
        s.bars.some(b =>
          b.voices.some(v =>
            v.beats.some(beat =>
              beat.notes.some(n => n.percussionArticulation === 46),
            ),
          ),
        ),
      ),
    );
    expect(sourceHas46).toBe(true);
    expect(hitsOf(result).some(h => h.piece === 'hihat')).toBe(true);
  });

  it('counts the same number of hits in and out', () => {
    expect(hitsOf(result).length).toBe(doc.notes.Expert!.length);
  });
});

describe('collapses that are intentional, not bugs', () => {
  it('merges two cymbals that fold to the same piece struck together', () => {
    // A china (52) and a splash (55) both fold to 'crash'. They occupy one
    // lane, so the pair becomes a single note rather than a duplicate.
    const score = createDrumsDemo();
    const bar = score.tracks[0].staves[0].bars[0];
    const beat = bar.voices[0].beats[0];
    for (const articulation of [52, 55]) {
      const note = new model.Note();
      note.percussionArticulation = articulation;
      beat.addNote(note);
    }
    const {doc} = scoreToChartDocument(score);
    const atZero = doc.notes.Expert!.filter(n => n.tick === 0 && n.piece === 'crash');
    expect(atZero).toHaveLength(1);
  });

  it('drops percussion with no lane and says how much', () => {
    const score = createDrumsDemo();
    const beat = score.tracks[0].staves[0].bars[0].voices[0].beats[0];
    const note = new model.Note();
    note.percussionArticulation = 60; // high bongo
    beat.addNote(note);

    const {dropped} = scoreToChartDocument(score);
    expect(dropped).toEqual({60: 1});
  });
});

describe('a tab from the library as a chart folder', () => {
  it('only offers itself on a score that has percussion', () => {
    expect(hasPercussionTrack(createDrumsDemo())).toBe(true);
    expect(hasPercussionTrack(createGuitarDemo())).toBe(false);
  });

  it('builds a folder Clone Hero can load', () => {
    const {folder} = buildScoreFolder(createDrumsDemo());
    expect(folder.files.map(f => f.name).sort()).toEqual([
      'album.png', 'notes.chart', 'song.ini', 'song.wav',
    ]);
    expect(folder.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(folder.notes).toEqual([]);
  });

  it('names the folder after the tab, not after a placeholder', () => {
    const {folder} = buildScoreFolder(createDrumsDemo());
    expect(folder.name).toBe('Chartmate Demo - Basic Rock Beat');
  });

  it('says so when percussion had to be dropped', () => {
    const score = createDrumsDemo();
    const beat = score.tracks[0].staves[0].bars[0].voices[0].beats[0];
    const note = new model.Note();
    note.percussionArticulation = 60; // high bongo — no lane
    beat.addNote(note);

    const {folder, dropped} = buildScoreFolder(score);
    expect(dropped).toEqual({60: 1});
    expect(folder.notes.join(' ')).toMatch(/1 percussion hit had no lane/);
  });
});
