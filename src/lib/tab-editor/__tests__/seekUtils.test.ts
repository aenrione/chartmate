import {describe, it, expect} from 'vitest';
import {computeSeekTick, tickToSeconds, barIndexToTick} from '../seekUtils';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeBeat(absolutePlaybackStart: number, barIndex?: number) {
  return {
    absolutePlaybackStart,
    voice: barIndex !== undefined
      ? {bar: {masterBar: {index: barIndex}}}
      : undefined,
  };
}

// ── computeSeekTick ───────────────────────────────────────────────────────────

describe('computeSeekTick', () => {
  describe('when absolutePlaybackStart is valid (> 0)', () => {
    it('returns absolutePlaybackStart directly', () => {
      expect(computeSeekTick(makeBeat(7680, 3), 8, 30720)).toBe(7680);
    });

    it('returns absolutePlaybackStart even when barIndex would give a different estimate', () => {
      // bar 2 of 4 bars, endTick 15360 → estimate would be 7680
      // but absolutePlaybackStart = 8000 (e.g. after a tempo change)
      expect(computeSeekTick(makeBeat(8000, 2), 4, 15360)).toBe(8000);
    });

    it('works when beat has no voice reference', () => {
      expect(computeSeekTick({absolutePlaybackStart: 3840}, 4, 15360)).toBe(3840);
    });
  });

  describe('when absolutePlaybackStart is 0 (beat not yet MIDI-processed)', () => {
    it('returns proportional bar estimate for a mid-score bar', () => {
      // bar 3 of 8, endTick 30720 → 3/8 * 30720 = 11520
      expect(computeSeekTick(makeBeat(0, 3), 8, 30720)).toBe(11520);
    });

    it('returns proportional bar estimate for the last bar', () => {
      // bar 7 of 8, endTick 30720 → 7/8 * 30720 = 26880
      expect(computeSeekTick(makeBeat(0, 7), 8, 30720)).toBe(26880);
    });

    it('returns 0 for bar 0 (first bar — tick 0 is correct)', () => {
      expect(computeSeekTick(makeBeat(0, 0), 8, 30720)).toBe(0);
    });

    it('returns 0 when beat has no barIndex (cannot estimate)', () => {
      expect(computeSeekTick({absolutePlaybackStart: 0}, 8, 30720)).toBe(0);
    });

    it('returns 0 when endTick is 0 (player not yet initialised)', () => {
      expect(computeSeekTick(makeBeat(0, 4), 8, 0)).toBe(0);
    });

    it('returns 0 when totalBars is 1 (single-bar score — bar estimate meaningless)', () => {
      expect(computeSeekTick(makeBeat(0, 0), 1, 3840)).toBe(0);
    });

    it('rounds the estimate to the nearest tick', () => {
      // bar 1 of 3, endTick 10000 → 1/3 * 10000 = 3333.33 → rounds to 3333
      expect(computeSeekTick(makeBeat(0, 1), 3, 10000)).toBe(3333);
    });
  });
});

// ── tickToSeconds ─────────────────────────────────────────────────────────────

describe('tickToSeconds', () => {
  it('converts tick to seconds proportionally', () => {
    // tick 11520 / 30720 total * 90s = 33.75s
    expect(tickToSeconds(11520, 30720, 90000)).toBeCloseTo(33.75);
  });

  it('returns 0 for tick 0', () => {
    expect(tickToSeconds(0, 30720, 90000)).toBe(0);
  });

  it('returns 0 when endTick is 0 (uninitialised)', () => {
    expect(tickToSeconds(1000, 0, 90000)).toBe(0);
  });

  it('returns 0 when endTimeMs is 0 (uninitialised)', () => {
    expect(tickToSeconds(1000, 30720, 0)).toBe(0);
  });

  it('returns full duration for last tick', () => {
    expect(tickToSeconds(30720, 30720, 90000)).toBeCloseTo(90);
  });

  it('handles fractional seconds', () => {
    expect(tickToSeconds(3840, 15360, 120000)).toBeCloseTo(30);
  });
});

// ── barIndexToTick ────────────────────────────────────────────────────────────

function makeScore(barCount: number) {
  const bars = Array.from({length: barCount}, (_, i) =>
    ({voices: [{beats: [{absolutePlaybackStart: 0}]}]}),
  );
  return {
    tracks: [{staves: [{bars}]}],
    masterBars: Array.from({length: barCount}),
  };
}

describe('barIndexToTick', () => {
  it('returns 0 for bar 0', () => {
    const score = makeScore(4);
    expect(barIndexToTick(score, 0, 4, 15360)).toBe(0);
  });

  it('returns proportional estimate for mid-score bars', () => {
    const score = makeScore(4);
    // bar 2 of 4, endTick 15360 → 2/4 * 15360 = 7680
    expect(barIndexToTick(score, 2, 4, 15360)).toBe(7680);
  });

  it('uses absolutePlaybackStart when > 0', () => {
    const score = makeScore(4);
    (score.tracks[0].staves[0].bars[1].voices[0].beats[0] as any).absolutePlaybackStart = 3840;
    expect(barIndexToTick(score, 1, 4, 15360)).toBe(3840);
  });

  it('returns endTick when barIndex >= totalBars', () => {
    const score = makeScore(4);
    expect(barIndexToTick(score, 4, 4, 15360)).toBe(15360);
  });
});
