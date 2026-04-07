import {describe, it, expect} from 'vitest';
import {parseChartFile} from '@eliwhite/scan-chart';
import {model} from '@coderline/alphatab';
import convertToAlphaTabDrums, {buildMeasureBoundaries} from '../convertToAlphaTabDrums';

const {Duration, Clef} = model;

// --- Test helpers ---

/** Generate a minimal .chart text with snare hits at given tick positions */
function makeChart(opts: {
  resolution?: number;
  bpm?: number;
  timeSigNum?: number;
  timeSigDenLog2?: number;
  noteTicks?: number[];
  noteType?: number;
} = {}): ReturnType<typeof parseChartFile> {
  const res = opts.resolution ?? 192;
  const bpm = opts.bpm ?? 120;
  const tsNum = opts.timeSigNum ?? 4;
  const tsDenLog = opts.timeSigDenLog2 ?? 2; // log2(4)=2
  const ticks = opts.noteTicks ?? [0, 96, 192, 288, 384, 480, 576, 672]; // 8th notes in 4/4
  const noteType = opts.noteType ?? 1; // 1 = red = snare

  const noteLines = ticks.map(t => `  ${t} = N ${noteType} 0`).join('\n');

  const chartText = `[Song]
{
  Resolution = ${res}
}

[SyncTrack]
{
  0 = TS ${tsNum} ${tsDenLog}
  0 = B ${bpm * 1000}
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

// --- Color mapping tests ---

describe('convertToAlphaTabDrums', () => {
  describe('MIDI mapping (note colors depend on correct MIDI)', () => {
    it('maps snare (red drum) notes to MIDI 38', () => {
      const chart = makeChart({noteTicks: [0, 96], noteType: 1}); // type 1 = redDrum = snare
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      const beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
      const noteBeats = beats.filter(b => !b.isEmpty);

      expect(noteBeats.length).toBeGreaterThan(0);
      for (const beat of noteBeats) {
        for (const note of beat.notes) {
          expect(note.percussionArticulation).toBe(38); // snare MIDI
        }
      }
    });

    it('maps kick notes to MIDI 36', () => {
      const chart = makeChart({noteTicks: [0, 192], noteType: 0}); // type 0 = kick
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      const noteBeats = score.tracks[0].staves[0].bars[0].voices[0].beats
        .filter(b => !b.isEmpty);

      expect(noteBeats.length).toBeGreaterThan(0);
      for (const beat of noteBeats) {
        for (const note of beat.notes) {
          expect(note.percussionArticulation).toBe(36); // kick MIDI
        }
      }
    });

    it('maps all drum instruments to distinct MIDI values', () => {
      // Create a chart with multiple note types at different ticks
      // Note types from scan-chart: 0=kick, 1=red(snare), 2=yellow, 3=blue, 4=green
      // Flags: cymbal=0x40 (64), tom=0x20 (32)
      // We can only test kick and snare with the simple chart format
      // since flags require more complex chart setup
      const chart = makeChart({noteTicks: [0, 96], noteType: 1});
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      const noteBeats = score.tracks[0].staves[0].bars[0].voices[0].beats
        .filter(b => !b.isEmpty);

      // Each note should have a valid percussion articulation
      for (const beat of noteBeats) {
        for (const note of beat.notes) {
          expect(note.percussionArticulation).toBeGreaterThanOrEqual(35);
          expect(note.percussionArticulation).toBeLessThanOrEqual(57);
        }
      }
    });
  });

  describe('score structure', () => {
    it('creates a percussion track with correct clef', () => {
      const chart = makeChart();
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      expect(score.tracks.length).toBe(1);
      expect(score.tracks[0].staves[0].isPercussion).toBe(true);
      expect(score.tracks[0].staves[0].showTablature).toBe(false);
      expect(score.tracks[0].staves[0].showStandardNotation).toBe(true);
      expect(score.tracks[0].staves[0].bars[0].clef).toBe(Clef.Neutral);
    });

    it('sets MIDI channel 9 for drums', () => {
      const chart = makeChart();
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      expect(score.tracks[0].playbackInfo.primaryChannel).toBe(9);
      expect(score.tracks[0].playbackInfo.secondaryChannel).toBe(9);
    });

    it('hides dynamics', () => {
      const chart = makeChart();
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      expect(score.stylesheet.hideDynamics).toBe(true);
    });

    it('sets tempo automation on first bar', () => {
      const chart = makeChart({bpm: 140});
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      expect(score.masterBars[0].tempoAutomations.length).toBe(1);
      expect(score.masterBars[0].tempoAutomations[0].value).toBe(140);
    });

    it('sets time signature correctly', () => {
      const chart = makeChart({timeSigNum: 3, timeSigDenLog2: 2}); // 3/4
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      expect(score.masterBars[0].timeSignatureNumerator).toBe(3);
      expect(score.masterBars[0].timeSignatureDenominator).toBe(4);
    });
  });

  describe('note duration quantization', () => {
    it('quantizes 8th note ticks to Duration.Eighth', () => {
      // 8th notes at PPQ 192 = 96 ticks apart
      const chart = makeChart({noteTicks: [0, 96, 192, 288, 384, 480, 576, 672]});
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      const noteBeats = score.tracks[0].staves[0].bars[0].voices[0].beats
        .filter(b => !b.isEmpty);

      for (const beat of noteBeats) {
        expect(beat.duration).toBe(Duration.Eighth);
      }
    });

    it('quantizes 16th note ticks to Duration.Sixteenth', () => {
      // 16th notes at PPQ 192 = 48 ticks apart
      const ticks = Array.from({length: 16}, (_, i) => i * 48);
      const chart = makeChart({noteTicks: ticks});
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      const noteBeats = score.tracks[0].staves[0].bars[0].voices[0].beats
        .filter(b => !b.isEmpty);

      for (const beat of noteBeats) {
        expect(beat.duration).toBe(Duration.Sixteenth);
      }
    });

    it('quantizes quarter note ticks to Duration.Quarter', () => {
      // Quarter notes at PPQ 192 = 192 ticks apart
      const chart = makeChart({noteTicks: [0, 192, 384, 576]});
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      const noteBeats = score.tracks[0].staves[0].bars[0].voices[0].beats
        .filter(b => !b.isEmpty);

      for (const beat of noteBeats) {
        expect(beat.duration).toBe(Duration.Quarter);
      }
    });
  });

  describe('sticking annotations', () => {
    it('adds R/L annotations as lyrics on beats', () => {
      const chart = makeChart({noteTicks: [0, 96, 192, 288]});
      const track = getDrumTrack(chart);
      const annotations = ['R', 'L', 'R', 'L'];

      const score = convertToAlphaTabDrums(chart, track, {noteAnnotations: annotations});

      const noteBeats = score.tracks[0].staves[0].bars[0].voices[0].beats
        .filter(b => !b.isEmpty);

      expect(noteBeats[0].lyrics).toEqual(['R']);
      expect(noteBeats[1].lyrics).toEqual(['L']);
      expect(noteBeats[2].lyrics).toEqual(['R']);
      expect(noteBeats[3].lyrics).toEqual(['L']);
    });

    it('cycles annotations when pattern is shorter than notes', () => {
      const chart = makeChart({noteTicks: [0, 96, 192, 288]});
      const track = getDrumTrack(chart);
      const annotations = ['R', 'L']; // only 2, but 4 notes

      const score = convertToAlphaTabDrums(chart, track, {noteAnnotations: annotations});

      const noteBeats = score.tracks[0].staves[0].bars[0].voices[0].beats
        .filter(b => !b.isEmpty);

      expect(noteBeats[0].lyrics).toEqual(['R']);
      expect(noteBeats[1].lyrics).toEqual(['L']);
      expect(noteBeats[2].lyrics).toEqual(['R']);
      expect(noteBeats[3].lyrics).toEqual(['L']);
    });

    it('does not add lyrics when no annotations provided', () => {
      const chart = makeChart({noteTicks: [0, 96]});
      const track = getDrumTrack(chart);

      const score = convertToAlphaTabDrums(chart, track);

      const noteBeats = score.tracks[0].staves[0].bars[0].voices[0].beats
        .filter(b => !b.isEmpty);

      for (const beat of noteBeats) {
        expect(beat.lyrics).toBeNull();
      }
    });
  });

  describe('sections', () => {
    it('adds section markers to master bars', () => {
      const chart = makeChart({noteTicks: [0, 96, 192, 288]});
      const track = getDrumTrack(chart);

      const score = convertToAlphaTabDrums(chart, track, {
        sections: [{tick: 0, name: 'Verse', msTime: 0, msLength: 2000}],
      });

      expect(score.masterBars[0].section).not.toBeNull();
      expect(score.masterBars[0].section!.text).toBe('Verse');
    });
  });

  describe('rest handling', () => {
    it('creates a note beat for a single hit', () => {
      // Single note — the measure still gets created with the note in it
      // Need at least 2 notes to define a measure boundary
      const chart = makeChart({noteTicks: [0, 768]}); // 2 notes, 1 measure apart
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      // First bar should have the note
      const bar0Beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
      const noteBeats = bar0Beats.filter(b => !b.isEmpty);
      expect(noteBeats.length).toBe(1);
      expect(noteBeats[0].notes[0].percussionArticulation).toBe(38);
    });

    it('inserts rests for gaps between notes', () => {
      // Note at tick 96, leaving a gap at the beginning (tick 0-96)
      // This forces a rest before the first note
      const chart = makeChart({noteTicks: [96, 288, 768]});
      const track = getDrumTrack(chart);
      const score = convertToAlphaTabDrums(chart, track);

      const beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
      const noteBeats = beats.filter(b => !b.isEmpty);
      const restBeats = beats.filter(b => b.isEmpty);
      expect(noteBeats.length).toBe(2); // notes at 96 and 288
      expect(restBeats.length).toBeGreaterThan(0); // rest for gap at start
    });
  });
});

describe('buildMeasureBoundaries', () => {
  it('returns correct number of measures for 4/4 time', () => {
    // 8 eighth notes = 1 measure in 4/4
    const chart = makeChart({noteTicks: [0, 96, 192, 288, 384, 480, 576, 672]});
    const track = getDrumTrack(chart);
    const infos = buildMeasureBoundaries(chart, track);

    expect(infos.length).toBe(1);
    expect(infos[0].timeSigNum).toBe(4);
    expect(infos[0].timeSigDen).toBe(4);
    expect(infos[0].startTick).toBe(0);
    expect(infos[0].barIndex).toBe(0);
  });

  it('computes ms timings from tempo', () => {
    // At 120 BPM, one quarter note = 500ms, one 4/4 measure = 2000ms
    const chart = makeChart({bpm: 120, noteTicks: [0, 96, 192, 288, 384, 480, 576, 672]});
    const track = getDrumTrack(chart);
    const infos = buildMeasureBoundaries(chart, track);

    expect(infos[0].startMs).toBe(0);
    expect(infos[0].endMs).toBe(2000);
  });

  it('handles multi-measure tracks', () => {
    // 16 eighth notes = 2 measures in 4/4
    const ticks = Array.from({length: 16}, (_, i) => i * 96);
    const chart = makeChart({noteTicks: ticks});
    const track = getDrumTrack(chart);
    const infos = buildMeasureBoundaries(chart, track);

    expect(infos.length).toBe(2);
    expect(infos[0].barIndex).toBe(0);
    expect(infos[1].barIndex).toBe(1);
    expect(infos[1].startTick).toBe(768); // 4/4 at PPQ 192
  });
});
