import {describe, it, expect} from 'vitest';
import {createBlankScore} from '../newScore';
import {setNote} from '../scoreOperations';
import {detectPatterns} from '../patternDetector';
import type {DetectedPattern} from '../patternDetector';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Put a unique note on bar i so it is distinguishable from other bars */
function markBar(score: ReturnType<typeof createBlankScore>, barIndex: number, fret: number) {
  setNote(score, {trackIndex: 0, barIndex, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, fret);
}

// ── single-bar detection (existing behaviour) ─────────────────────────────────

describe('detectPatterns — single-bar', () => {
  it('returns empty array for a score with 0 bars', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 1, instrument: 'guitar'});
    score.masterBars.length = 0;
    score.tracks[0].staves[0].bars.length = 0;
    expect(detectPatterns(score)).toEqual([]);
  });

  it('detects two bars with identical notes as a pattern', () => {
    // Bars 0 and 2 are identical empty rests; bars 1 and 3 have fret-5 notes.
    // With dominance filtering, the 2-bar window [rest, note5] repeats at positions 0 and 2,
    // covering all 4 bars. The 1-bar note5 pattern is dominated and suppressed.
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    markBar(score, 1, 5);
    markBar(score, 3, 5);
    const patterns = detectPatterns(score);
    const twoBar = patterns.find(p => p.barLength === 2 && p.instances.includes(0) && p.instances.includes(2));
    expect(twoBar).toBeDefined();
    expect(twoBar!.instances).toEqual([0, 2]);
  });

  it('does not report repeating patterns when no bars repeat', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 2, instrument: 'guitar'});
    markBar(score, 0, 5);
    markBar(score, 1, 7);
    const patterns = detectPatterns(score);
    expect(patterns.filter(p => !p.unique)).toHaveLength(0);
  });

  it('assigns labels in descending coverage order', () => {
    // bars 0,1,2 are empty rests (coverage 3), bars 3,4 have a note (coverage 2)
    const score = createBlankScore({title: '', tempo: 120, measureCount: 5, instrument: 'guitar'});
    markBar(score, 3, 5);
    markBar(score, 4, 5);
    const patterns = detectPatterns(score);
    const A = patterns.find(p => p.label === 'A');
    const B = patterns.find(p => p.label === 'B');
    expect(A).toBeDefined();
    expect(A!.instances).toHaveLength(3);
    expect(B).toBeDefined();
    expect(B!.instances).toHaveLength(2);
  });

  it('returns empty array for single-bar score', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 1, instrument: 'guitar'});
    expect(detectPatterns(score)).toEqual([]);
  });
});

// ── multi-bar detection ───────────────────────────────────────────────────────

describe('detectPatterns — multi-bar', () => {
  it('detects a 2-bar repeating sequence', () => {
    // Score: [A][B][A][B] — A and B always appear together
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    markBar(score, 0, 5); // A
    markBar(score, 1, 7); // B
    markBar(score, 2, 5); // A
    markBar(score, 3, 7); // B

    const patterns = detectPatterns(score);
    const twoBar = patterns.find(p => p.barLength === 2);
    expect(twoBar).toBeDefined();
    expect(twoBar!.instances).toEqual([0, 2]); // starts at bar 0 and bar 2
  });

  it('multi-bar pattern instances are non-overlapping', () => {
    // Score: [A][B][A][B][A][B] — AB repeats 3 times
    const score = createBlankScore({title: '', tempo: 120, measureCount: 6, instrument: 'guitar'});
    markBar(score, 0, 5); markBar(score, 2, 5); markBar(score, 4, 5);
    markBar(score, 1, 7); markBar(score, 3, 7); markBar(score, 5, 7);

    const patterns = detectPatterns(score);
    const twoBar = patterns.find(p => p.barLength === 2);
    expect(twoBar).toBeDefined();
    // instances must not overlap: each pair must be ≥ 2 bars apart
    const inst = twoBar!.instances;
    for (let i = 1; i < inst.length; i++) {
      expect(inst[i] - inst[i - 1]).toBeGreaterThanOrEqual(2);
    }
  });

  it('ranks a longer pattern with equal coverage higher (label A)', () => {
    // 2-bar AB repeats 2 times (coverage 4) vs A alone repeating 2 times (coverage 2)
    // → 2-bar AB should get label A
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    markBar(score, 0, 5); // A
    markBar(score, 1, 7); // B — distinct from A
    markBar(score, 2, 5); // A
    markBar(score, 3, 7); // B

    const patterns = detectPatterns(score);
    const labelA = patterns.find(p => p.label === 'A');
    expect(labelA).toBeDefined();
    expect(labelA!.barLength).toBe(2);
    expect(labelA!.instances).toEqual([0, 2]);
  });

  it('single-bar patterns still appear when bars repeat outside multi-bar groups', () => {
    // [A][B][C][A] — A repeats as a single bar; no 2-bar pair repeats
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    markBar(score, 0, 5); // A
    markBar(score, 1, 7); // B
    markBar(score, 2, 9); // C
    markBar(score, 3, 5); // A again

    const patterns = detectPatterns(score);
    const singleBarA = patterns.find(p => p.barLength === 1 && p.instances.includes(0) && p.instances.includes(3));
    expect(singleBarA).toBeDefined();
  });

  it('barLength is correct for detected patterns', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    markBar(score, 0, 5);
    markBar(score, 1, 7);
    markBar(score, 2, 5);
    markBar(score, 3, 7);

    const patterns = detectPatterns(score);
    for (const p of patterns) {
      expect(p.barLength).toBeGreaterThanOrEqual(1);
      // instances respect barLength: no two instances overlap
      for (let i = 1; i < p.instances.length; i++) {
        expect(p.instances[i] - p.instances[i - 1]).toBeGreaterThanOrEqual(p.barLength);
      }
    }
  });
});

// ── unique sections ───────────────────────────────────────────────────────────

describe('detectPatterns — unique sections', () => {
  it('labels unrepeated bars as U1, U2, … with unique flag', () => {
    // [A][X][A] — bar 1 (X) is unique; bars 0 and 2 repeat
    const score = createBlankScore({title: '', tempo: 120, measureCount: 3, instrument: 'guitar'});
    markBar(score, 0, 5); // A
    markBar(score, 1, 7); // X — unique
    markBar(score, 2, 5); // A

    const patterns = detectPatterns(score);
    const u = patterns.find(p => p.unique);
    expect(u).toBeDefined();
    expect(u!.label).toBe('U1');
    expect(u!.instances).toEqual([1]);
    expect(u!.barLength).toBe(1);
  });

  it('groups consecutive unique bars into one section', () => {
    // [A][X][Y][A] — bars 1,2 are unique consecutive; bars 0,3 repeat
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    markBar(score, 0, 5); // A
    markBar(score, 1, 7); // X
    markBar(score, 2, 9); // Y
    markBar(score, 3, 5); // A

    const patterns = detectPatterns(score);
    const unique = patterns.filter(p => p.unique);
    expect(unique).toHaveLength(1);
    expect(unique[0].instances).toEqual([1]);
    expect(unique[0].barLength).toBe(2);
  });

  it('creates separate unique sections for non-consecutive unique bars', () => {
    // [A][X][A][Y] — bars 1 and 3 are unique but not consecutive
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    markBar(score, 0, 5); // A
    markBar(score, 1, 7); // X — unique
    markBar(score, 2, 5); // A
    markBar(score, 3, 9); // Y — unique

    const patterns = detectPatterns(score);
    const unique = patterns.filter(p => p.unique);
    expect(unique).toHaveLength(2);
    expect(unique[0].label).toBe('U1');
    expect(unique[0].instances).toEqual([1]);
    expect(unique[1].label).toBe('U2');
    expect(unique[1].instances).toEqual([3]);
  });

  it('all bars are unique when nothing repeats', () => {
    // [A][B] — 2 bars, each appears once. Consecutive uncovered bars collapse into one unique section.
    const score = createBlankScore({title: '', tempo: 120, measureCount: 2, instrument: 'guitar'});
    markBar(score, 0, 5);
    markBar(score, 1, 7);

    const patterns = detectPatterns(score);
    const repeating = patterns.filter(p => !p.unique);
    const unique = patterns.filter(p => p.unique);
    expect(repeating).toHaveLength(0);
    expect(unique).toHaveLength(1);
    expect(unique[0].barLength).toBe(2);
    expect(unique[0].instances).toEqual([0]);
  });
});
