import {describe, it, expect} from 'vitest';
import {parseChartFile, noteFlags, noteTypes} from '@eliwhite/scan-chart';
import {writeChart} from '../writeChart';
import {CHART_RESOLUTION, type ChartDocument, type ChartNote} from '../types';
import {DRUM_PIECES, pieceFromChartNote} from '@/lib/drums/pieces';

function doc(partial: Partial<ChartDocument> = {}): ChartDocument {
  return {
    resolution: CHART_RESOLUTION,
    song: {name: 'Test', artist: 'Chartmate', charter: 'Chartmate'},
    tempos: [{tick: 0, bpm: 120}],
    timeSignatures: [{tick: 0, numerator: 4, denominator: 4}],
    sections: [],
    notes: {},
    ...partial,
  };
}

function parse(text: string) {
  return parseChartFile(new TextEncoder().encode(text), 'chart', {
    pro_drums: true,
  });
}

function drumTrack(text: string) {
  const chart = parse(text);
  const track = chart.trackData.find(
    t => t.instrument === 'drums' && t.difficulty === 'expert',
  );
  if (!track) throw new Error('no expert drums track');
  return track;
}

describe('writeChart', () => {
  it('emits no comments', () => {
    const text = writeChart(doc({sections: [{tick: 0, name: 'Intro'}]}));
    expect(text).not.toContain('//');
  });

  it('writes tempo in milli-BPM', () => {
    const text = writeChart(doc({tempos: [{tick: 0, bpm: 120}, {tick: 768, bpm: 92.5}]}));
    expect(text).toContain('0 = B 120000');
    expect(text).toContain('768 = B 92500');
    expect(parse(text).tempos.map(t => t.beatsPerMinute)).toEqual([120, 92.5]);
  });

  it('omits the time signature exponent when it is 2, and writes it otherwise', () => {
    const text = writeChart(doc({
      timeSignatures: [
        {tick: 0, numerator: 4, denominator: 4},
        {tick: 768, numerator: 6, denominator: 8},
      ],
    }));
    expect(text).toContain('0 = TS 4\r\n');
    expect(text).toContain('768 = TS 6 3');
    expect(parse(text).timeSignatures.map(t => [t.numerator, t.denominator]))
      .toEqual([[4, 4], [6, 8]]);
  });

  it('rejects a denominator that is not a power of two', () => {
    expect(() => writeChart(doc({
      timeSignatures: [{tick: 0, numerator: 4, denominator: 3}],
    }))).toThrow(/power of 2/);
  });

  it('survives a round trip for every piece, toms and cymbals alike', () => {
    const notes: ChartNote[] = DRUM_PIECES.map((piece, i) => ({
      tick: i * 192,
      piece,
    }));
    const track = drumTrack(writeChart(doc({notes: {Expert: notes}})));

    const seen = track.noteEventGroups.map(group => ({
      tick: group[0].tick,
      piece: pieceFromChartNote(group[0]),
    }));
    expect(seen).toEqual(notes.map(n => ({tick: n.tick, piece: n.piece})));
  });

  it('marks cymbals, not toms — the .chart polarity', () => {
    const text = writeChart(doc({
      notes: {Expert: [
        {tick: 0, piece: 'hihat'},
        {tick: 192, piece: 'high-tom'},
      ]},
    }));
    // The hi-hat gets a 66 marker; the tom on the same lane gets nothing.
    expect(text).toContain('0 = N 2 0');
    expect(text).toContain('0 = N 66 0');
    expect(text).toContain('192 = N 2 0');
    expect(text).not.toContain('192 = N 66');

    const groups = drumTrack(text).noteEventGroups;
    expect(groups[0][0].flags & noteFlags.cymbal).toBeTruthy();
    expect(groups[1][0].flags & noteFlags.tom).toBeTruthy();
  });

  it('writes a double kick as N 32', () => {
    const text = writeChart(doc({
      notes: {Expert: [
        {tick: 0, piece: 'kick'},
        {tick: 96, piece: 'kick', doubleKick: true},
      ]},
    }));
    expect(text).toContain('0 = N 0 0');
    expect(text).toContain('96 = N 32 0');

    // scan-chart folds N 32 back into a kick carrying the doubleKick flag.
    const groups = drumTrack(text).noteEventGroups;
    expect(groups.map(g => g[0].type)).toEqual([noteTypes.kick, noteTypes.kick]);
    expect(groups[0][0].flags & noteFlags.doubleKick).toBeFalsy();
    expect(groups[1][0].flags & noteFlags.doubleKick).toBeTruthy();
  });

  it('writes accents and ghosts on the pads but never on the kick', () => {
    const text = writeChart(doc({
      notes: {Expert: [
        {tick: 0, piece: 'snare', accent: true},
        {tick: 96, piece: 'snare', ghost: true},
        {tick: 192, piece: 'crash', accent: true},
        {tick: 288, piece: 'kick', accent: true, ghost: true},
      ]},
    }));
    expect(text).toContain('0 = N 34 0');   // accent, red
    expect(text).toContain('96 = N 40 0');  // ghost, red
    expect(text).toContain('192 = N 37 0'); // accent, green
    expect(text).not.toMatch(/288 = N (3[3-8]|4[0-4])/);

    const groups = drumTrack(text).noteEventGroups;
    expect(groups[0][0].flags & noteFlags.accent).toBeTruthy();
    expect(groups[1][0].flags & noteFlags.ghost).toBeTruthy();
  });

  it('writes sections and star power', () => {
    const text = writeChart(doc({
      sections: [{tick: 0, name: 'Intro'}, {tick: 768, name: 'Verse 1'}],
      starPower: [{tick: 0, length: 768}],
      notes: {Expert: [{tick: 0, piece: 'snare'}]},
    }));
    expect(text).toContain('0 = E "section Intro"');
    expect(text).toContain('768 = E "section Verse 1"');
    expect(text).toContain('0 = S 2 768');

    const chart = parse(text);
    expect(chart.sections.map(s => s.name)).toEqual(['Intro', 'Verse 1']);
  });

  it('orders every line by tick', () => {
    const text = writeChart(doc({
      notes: {Expert: [
        {tick: 384, piece: 'crash'},
        {tick: 0, piece: 'kick'},
        {tick: 192, piece: 'snare', accent: true},
      ]},
    }));
    const ticks = [...text.matchAll(/^ {2}(\d+) = N /gm)].map(m => Number(m[1]));
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  });

  it('writes one block per difficulty that has notes', () => {
    const text = writeChart(doc({
      notes: {
        Expert: [{tick: 0, piece: 'snare'}],
        Easy: [{tick: 0, piece: 'kick'}],
        Hard: [],
      },
    }));
    expect(text).toContain('[ExpertDrums]');
    expect(text).toContain('[EasyDrums]');
    expect(text).not.toContain('[HardDrums]');
  });
});
