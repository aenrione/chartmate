import {describe, it, expect} from 'vitest';
import {parseChartFile} from '@eliwhite/scan-chart';
import {model, Settings} from '@coderline/alphatab';
import convertToAlphaTabDrums from '../convertToAlphaTabDrums';

const {Duration} = model;

/**
 * These tests verify that convertToAlphaTabDrums produces a stable Score
 * that doesn't cause AlphaTab to re-render infinitely.
 *
 * The infinite re-render bug was caused by:
 * 1. Floating-point tempo values (e.g. 118.845...) causing layout instability
 * 2. Score structure causing AlphaTab's container to resize on each render
 *
 * The key invariant: calling convertToAlphaTabDrums twice with the same input
 * must produce structurally identical scores (same bar count, same note count,
 * same tempo, same durations).
 */

function makeChartWithTempo(bpm: number, noteCount: number = 16) {
  const res = 192;
  const ticks = Array.from({length: noteCount}, (_, i) => i * (res / 2)); // 8th notes

  const noteLines = ticks.map(t => `  ${t} = N 1 0`).join('\n');
  const chartText = `[Song]
{
  Resolution = ${res}
}

[SyncTrack]
{
  0 = TS 4 2
  0 = B ${Math.round(bpm * 1000)}
}

[ExpertDrums]
{
${noteLines}
}
`;
  const data = new TextEncoder().encode(chartText);
  return parseChartFile(data, 'chart', {});
}

function getDrumTrack(chart: ReturnType<typeof parseChartFile>) {
  const track = chart.trackData.find(t => t.instrument === 'drums');
  if (!track) throw new Error('No drum track');
  return track;
}

describe('AlphaTab render stability', () => {
  it('produces identical scores on repeated conversions (no render drift)', () => {
    const chart = makeChartWithTempo(120, 32);
    const track = getDrumTrack(chart);

    const score1 = convertToAlphaTabDrums(chart, track);
    const score2 = convertToAlphaTabDrums(chart, track);

    // Same number of bars
    expect(score1.masterBars.length).toBe(score2.masterBars.length);

    // Same number of beats per bar
    for (let i = 0; i < score1.masterBars.length; i++) {
      const beats1 = score1.tracks[0].staves[0].bars[i].voices[0].beats;
      const beats2 = score2.tracks[0].staves[0].bars[i].voices[0].beats;
      expect(beats1.length).toBe(beats2.length);

      // Same durations
      for (let j = 0; j < beats1.length; j++) {
        expect(beats1[j].duration).toBe(beats2[j].duration);
        expect(beats1[j].dots).toBe(beats2[j].dots);
        expect(beats1[j].isEmpty).toBe(beats2[j].isEmpty);
      }
    }
  });

  it('rounds tempo to integer to prevent layout oscillation', () => {
    // Floating-point tempos like 118.845... caused AlphaTab to re-layout infinitely
    const chart = makeChartWithTempo(118.845);
    const track = getDrumTrack(chart);
    const score = convertToAlphaTabDrums(chart, track);

    const tempo = score.masterBars[0].tempoAutomations[0].value;
    expect(tempo).toBe(Math.round(tempo)); // Must be integer
    expect(Number.isInteger(tempo)).toBe(true);
  });

  it('tempo rounding does not lose significant precision', () => {
    const chart = makeChartWithTempo(119.5);
    const track = getDrumTrack(chart);
    const score = convertToAlphaTabDrums(chart, track);

    const tempo = score.masterBars[0].tempoAutomations[0].value;
    expect(tempo).toBe(120); // 119.5 rounds to 120
  });

  it('score structure is deterministic regardless of call count', () => {
    const chart = makeChartWithTempo(140, 64);
    const track = getDrumTrack(chart);

    // Convert 5 times and verify all produce the same structure
    const scores = Array.from({length: 5}, () => convertToAlphaTabDrums(chart, track));

    const barCounts = scores.map(s => s.masterBars.length);
    const noteCounts = scores.map(s =>
      s.tracks[0].staves[0].bars.reduce((sum, bar) =>
        sum + bar.voices[0].beats.filter(b => !b.isEmpty).length, 0
      )
    );

    // All should be identical
    expect(new Set(barCounts).size).toBe(1);
    expect(new Set(noteCounts).size).toBe(1);
  });
});
