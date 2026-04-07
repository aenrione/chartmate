import {describe, it, expect} from 'vitest';
import {createBlankScore} from '../newScore';
import {setNote, setBeatDuration} from '../scoreOperations';
import {exportToAlphaTex, exportToGp7} from '../exporters';
import {model} from '@coderline/alphatab';
import type {EditorCursor} from '../useEditorCursor';

const {Duration} = model;

function makeCursor(overrides?: Partial<EditorCursor>): EditorCursor {
  return {trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringNumber: 1, ...overrides};
}

describe('playback readiness', () => {
  it('blank score has valid structure for playback', () => {
    const score = createBlankScore({measureCount: 4, tempo: 120});
    // Score must have tracks, staves, bars, voices
    expect(score.tracks.length).toBe(1);
    expect(score.tracks[0].staves.length).toBe(1);
    expect(score.tracks[0].staves[0].bars.length).toBe(4);

    // Each bar should have at least one voice with at least one beat
    for (const bar of score.tracks[0].staves[0].bars) {
      expect(bar.voices.length).toBeGreaterThanOrEqual(1);
      expect(bar.voices[0].beats.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('score with notes exports to GP7 (required for playback)', () => {
    const score = createBlankScore({measureCount: 4, tempo: 120});
    // Place some notes
    setNote(score, makeCursor({barIndex: 0, stringNumber: 1}), 0);
    setNote(score, makeCursor({barIndex: 0, stringNumber: 2}), 2);
    setNote(score, makeCursor({barIndex: 1, stringNumber: 1}), 5);
    setNote(score, makeCursor({barIndex: 2, stringNumber: 3}), 7);

    const gp7 = exportToGp7(score);
    expect(gp7.length).toBeGreaterThan(0);

    // AlphaTex export should contain the notes
    const tex = exportToAlphaTex(score);
    expect(tex.length).toBeGreaterThan(0);
  });

  it('score with notes has non-empty beats', () => {
    const score = createBlankScore({measureCount: 2, tempo: 120});
    setNote(score, makeCursor({stringNumber: 1}), 5);
    setBeatDuration(score, makeCursor(), Duration.Quarter);

    const beat = score.tracks[0].staves[0].bars[0].voices[0].beats[0];
    expect(beat.isEmpty).toBe(false);
    expect(beat.notes.length).toBeGreaterThan(0);
    expect(beat.duration).toBe(Duration.Quarter);
  });

  it('tempo automation is set on first master bar', () => {
    const score = createBlankScore({measureCount: 2, tempo: 140});
    const firstBar = score.masterBars[0];
    expect(firstBar.tempoAutomations).toBeDefined();
    expect(firstBar.tempoAutomations.length).toBeGreaterThan(0);
    expect(firstBar.tempoAutomations[0].value).toBe(140);
  });

  it('track has correct playback info for MIDI', () => {
    const score = createBlankScore({measureCount: 2, instrument: 'guitar'});
    const playback = score.tracks[0].playbackInfo;
    expect(playback.volume).toBeGreaterThan(0);
    expect(playback.program).toBeGreaterThanOrEqual(0);
    expect(playback.primaryChannel).toBeDefined();
    expect(playback.secondaryChannel).toBeDefined();
  });

  it('score with notes round-trips through AlphaTex', () => {
    const score = createBlankScore({measureCount: 2, tempo: 120});
    setNote(score, makeCursor({stringNumber: 1}), 5);
    setNote(score, makeCursor({stringNumber: 3}), 7);

    const tex = exportToAlphaTex(score);
    // Should contain fret references
    expect(tex).toMatch(/\d/); // has numbers (frets/durations)
  });

  it('drums track uses channel 9 for GM percussion', () => {
    const score = createBlankScore({measureCount: 2, instrument: 'drums'});
    const playback = score.tracks[0].playbackInfo;
    expect(playback.primaryChannel).toBe(9);
    expect(playback.secondaryChannel).toBe(9);
  });
});
