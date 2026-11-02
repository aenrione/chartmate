/**
 * These pin validate.ts to what scan-chart actually does, because the two
 * disagreed with the published docs in ways that produced noise on every
 * export: the leading-silence threshold is 1000 ms, and the no-star-power
 * warning exempts drums entirely.
 */

import {describe, it, expect} from 'vitest';
import {
  BROKEN_NOTE_MS,
  MIN_LEADING_SILENCE_MS,
  hasErrors,
  validateChartDocument,
} from '../validate';
import {CHART_RESOLUTION, type ChartDocument, type ChartNote} from '../types';

function doc(notes: ChartNote[], overrides: Partial<ChartDocument> = {}): ChartDocument {
  return {
    resolution: CHART_RESOLUTION,
    song: {name: 'T', artist: 'A', charter: 'C'},
    tempos: [{tick: 0, bpm: 90}],
    timeSignatures: [{tick: 0, numerator: 4, denominator: 4}],
    sections: [{tick: 0, name: 'Main'}],
    notes: {Expert: notes},
    ...overrides,
  };
}

const types = (d: ChartDocument) => validateChartDocument(d).map(i => i.type);

describe('validateChartDocument', () => {
  it('errors on an empty chart', () => {
    const issues = validateChartDocument(doc([]));
    expect(issues.map(i => i.type)).toEqual(['noNotes']);
    expect(hasErrors(issues)).toBe(true);
  });

  it('never warns about star power — scan-chart exempts drums', () => {
    expect(types(doc([{tick: 768, piece: 'snare'}]))).not.toContain('noStarPower');
  });

  it('uses 1000 ms, not 2000, as the leading-silence floor', () => {
    expect(MIN_LEADING_SILENCE_MS).toBe(1000);
    // 90 BPM: a quarter note is 666 ms, so tick 192 is under the floor…
    expect(types(doc([{tick: 192, piece: 'snare'}]))).toContain('smallLeadingSilence');
    // …and tick 384 (1333 ms) clears it.
    expect(types(doc([{tick: 384, piece: 'snare'}]))).not.toContain('smallLeadingSilence');
  });

  it('flags a default tempo map only when the time signature is also default', () => {
    const notes: ChartNote[] = [{tick: 768, piece: 'snare'}];
    expect(types(doc(notes, {tempos: [{tick: 0, bpm: 120}]}))).toContain('isDefaultBPM');
    // A constant 120 in 7/8 is a mapped chart, not an unmapped one.
    expect(
      types(doc(notes, {
        tempos: [{tick: 0, bpm: 120}],
        timeSignatures: [{tick: 0, numerator: 7, denominator: 8}],
      })),
    ).not.toContain('isDefaultBPM');
    expect(types(doc(notes, {tempos: [{tick: 0, bpm: 92}]}))).not.toContain('isDefaultBPM');
  });

  it('measures broken notes between note groups, not within a lane', () => {
    // 240 BPM: one tick is 1.3 ms, so two groups two ticks apart are broken…
    const fast = {tempos: [{tick: 0, bpm: 240}]};
    expect(types(doc([
      {tick: 768, piece: 'snare'},
      {tick: 770, piece: 'kick'},
    ], fast))).toContain('brokenNote');

    // …while two pieces on the same tick are a chord, not a broken note.
    expect(types(doc([
      {tick: 768, piece: 'snare'},
      {tick: 768, piece: 'kick'},
    ], fast))).not.toContain('brokenNote');
  });

  it('matches scan-chart on the 15 ms threshold', () => {
    expect(BROKEN_NOTE_MS).toBe(15);
  });

  it('warns, not errors, on three non-kick lanes at once', () => {
    const issues = validateChartDocument(doc([
      {tick: 768, piece: 'snare'},
      {tick: 768, piece: 'hihat'},
      {tick: 768, piece: 'ride'},
    ]));
    expect(issues.map(i => i.type)).toContain('invalidChord');
    expect(hasErrors(issues)).toBe(false);
  });

  it('counts the kick as free — it is a foot', () => {
    expect(types(doc([
      {tick: 768, piece: 'snare'},
      {tick: 768, piece: 'hihat'},
      {tick: 768, piece: 'kick'},
    ]))).not.toContain('invalidChord');
  });

  it('warns about a chart with no sections', () => {
    expect(types(doc([{tick: 768, piece: 'snare'}], {sections: []})))
      .toContain('noSections');
  });
});
