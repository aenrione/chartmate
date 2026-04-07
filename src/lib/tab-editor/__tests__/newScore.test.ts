import {describe, it, expect} from 'vitest';
import {createBlankScore} from '../newScore';
import {model} from '@coderline/alphatab';

const {Duration} = model;

describe('createBlankScore', () => {
  it('creates a score with default options', () => {
    const score = createBlankScore();
    expect(score).toBeDefined();
    expect(score.title).toBe('Untitled');
    expect(score.tracks.length).toBe(1);
    expect(score.masterBars.length).toBe(4);
  });

  it('creates a score with custom title and artist', () => {
    const score = createBlankScore({title: 'My Song', artist: 'Me'});
    expect(score.title).toBe('My Song');
    expect(score.artist).toBe('Me');
  });

  it('creates specified number of measures', () => {
    const score = createBlankScore({measureCount: 8});
    expect(score.masterBars.length).toBe(8);
  });

  it('sets tempo on first master bar', () => {
    const score = createBlankScore({tempo: 140});
    const firstBar = score.masterBars[0];
    expect(firstBar.tempoAutomations).toBeDefined();
    expect(firstBar.tempoAutomations.length).toBeGreaterThan(0);
    expect(firstBar.tempoAutomations[0].value).toBe(140);
  });

  it('creates guitar track with 6 strings by default', () => {
    const score = createBlankScore({instrument: 'guitar'});
    const track = score.tracks[0];
    expect(track.name).toBe('Guitar');
    const staff = track.staves[0];
    expect(staff.showTablature).toBe(true);
    expect(staff.showStandardNotation).toBe(true);
    expect(staff.isPercussion).toBe(false);
    expect(staff.stringTuning.tunings.length).toBe(6);
  });

  it('creates bass track with 4 strings', () => {
    const score = createBlankScore({instrument: 'bass'});
    const track = score.tracks[0];
    expect(track.name).toBe('Bass');
    const staff = track.staves[0];
    expect(staff.stringTuning.tunings.length).toBe(4);
  });

  it('creates drums track as percussion', () => {
    const score = createBlankScore({instrument: 'drums'});
    const track = score.tracks[0];
    expect(track.name).toBe('Drums');
    const staff = track.staves[0];
    expect(staff.isPercussion).toBe(true);
    expect(staff.showTablature).toBe(false);
    expect(staff.showStandardNotation).toBe(true);
  });

  it('creates 7-string guitar when specified', () => {
    const score = createBlankScore({instrument: 'guitar', stringCount: 7});
    const staff = score.tracks[0].staves[0];
    expect(staff.stringTuning.tunings.length).toBe(7);
  });

  it('creates bars for each track staff', () => {
    const score = createBlankScore({measureCount: 4});
    const staff = score.tracks[0].staves[0];
    expect(staff.bars.length).toBe(4);
  });

  it('fills measures with whole-note rests', () => {
    const score = createBlankScore({measureCount: 2});
    const staff = score.tracks[0].staves[0];
    const firstBar = staff.bars[0];
    const voice = firstBar.voices[0];
    expect(voice.beats.length).toBeGreaterThanOrEqual(1);
    expect(voice.beats[0].isEmpty).toBe(true);
  });

  it('sets 4/4 time signature by default', () => {
    const score = createBlankScore();
    const masterBar = score.masterBars[0];
    expect(masterBar.timeSignatureNumerator).toBe(4);
    expect(masterBar.timeSignatureDenominator).toBe(4);
  });

  it('accepts custom time signature', () => {
    const score = createBlankScore({
      timeSignatureNumerator: 3,
      timeSignatureDenominator: 4,
    });
    const masterBar = score.masterBars[0];
    expect(masterBar.timeSignatureNumerator).toBe(3);
    expect(masterBar.timeSignatureDenominator).toBe(4);
  });

  it('uses drums channel 9 for percussion', () => {
    const score = createBlankScore({instrument: 'drums'});
    const playback = score.tracks[0].playbackInfo;
    expect(playback.primaryChannel).toBe(9);
  });
});
