import {describe, it, expect} from 'vitest';
import {createBlankScore} from '../newScore';
import {setNote} from '../scoreOperations';
import {detectPatterns} from '../patternDetector';
import type {DetectedPattern} from '../patternDetector';

describe('detectPatterns', () => {
  it('returns empty array for a score with 0 bars', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 1, instrument: 'guitar'});
    score.masterBars.length = 0;
    score.tracks[0].staves[0].bars.length = 0;
    expect(detectPatterns(score)).toEqual([]);
  });

  it('detects two bars with identical notes as a pattern', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    // bars 1 and 3 both have fret 5 on string 1 (bars 0 and 2 remain empty rests)
    setNote(score, {trackIndex: 0, barIndex: 1, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, 5);
    setNote(score, {trackIndex: 0, barIndex: 3, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, 5);
    const patterns = detectPatterns(score);
    const match = patterns.find(p => p.instances.includes(1) && p.instances.includes(3));
    expect(match).toBeDefined();
    expect(match!.instances.sort()).toEqual([1, 3]);
  });

  it('does not report bars that only appear once', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 2, instrument: 'guitar'});
    // bar 0: fret 5, bar 1: fret 7 — both unique
    setNote(score, {trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, 5);
    setNote(score, {trackIndex: 0, barIndex: 1, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, 7);
    const patterns = detectPatterns(score);
    expect(patterns).toHaveLength(0);
  });

  it('assigns labels A, B, C in descending frequency order', () => {
    // 5 bars: 0,1,2 are empty (same rest), 3 and 4 have a note (same note)
    const score = createBlankScore({title: '', tempo: 120, measureCount: 5, instrument: 'guitar'});
    setNote(score, {trackIndex: 0, barIndex: 3, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, 5);
    setNote(score, {trackIndex: 0, barIndex: 4, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, 5);
    const patterns = detectPatterns(score);
    // 3 empty bars → label A (freq 3), 2 note bars → label B (freq 2)
    const A = patterns.find(p => p.label === 'A');
    const B = patterns.find(p => p.label === 'B');
    expect(A).toBeDefined();
    expect(A!.instances).toHaveLength(3);
    expect(B).toBeDefined();
    expect(B!.instances).toHaveLength(2);
  });

  it('each pattern has a unique color', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    setNote(score, {trackIndex: 0, barIndex: 1, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, 5);
    setNote(score, {trackIndex: 0, barIndex: 3, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, 5);
    const patterns = detectPatterns(score);
    const colors = patterns.map(p => p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
