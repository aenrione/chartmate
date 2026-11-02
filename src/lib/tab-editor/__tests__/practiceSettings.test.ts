import {describe, it, expect} from 'vitest';
import {createBlankScore} from '../newScore';
import {
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_SIDEBAR_SECTIONS,
  adjustPlaybackSpeed,
  canMutateScore,
  clampPlaybackSpeed,
  computeLoopRange,
  formatLoopRange,
  loopRangeToTicks,
  normalizeLoopRange,
  otherMode,
  parseEditorMode,
  parseSidebarSections,
  playbackSpeedFactor,
} from '../practiceSettings';

describe('playback speed', () => {
  it('clamps to the 25–200 % slider range', () => {
    expect(clampPlaybackSpeed(10)).toBe(25);
    expect(clampPlaybackSpeed(500)).toBe(200);
    expect(clampPlaybackSpeed(100)).toBe(100);
  });

  it('snaps to 5 % steps', () => {
    expect(clampPlaybackSpeed(63)).toBe(65);
    expect(clampPlaybackSpeed(62)).toBe(60);
  });

  it('falls back to 100 % for junk', () => {
    expect(clampPlaybackSpeed(Number.NaN)).toBe(DEFAULT_PLAYBACK_SPEED);
    expect(clampPlaybackSpeed(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PLAYBACK_SPEED);
  });

  it('nudges by whole percent and stops at the ends', () => {
    expect(adjustPlaybackSpeed(100, 5)).toBe(105);
    expect(adjustPlaybackSpeed(100, -5)).toBe(95);
    expect(adjustPlaybackSpeed(25, -5)).toBe(25);
    expect(adjustPlaybackSpeed(200, 5)).toBe(200);
  });

  it('converts percent to the factor AlphaTab wants', () => {
    expect(playbackSpeedFactor(50)).toBe(0.5);
    expect(playbackSpeedFactor(100)).toBe(1);
    expect(playbackSpeedFactor(1000)).toBe(2);
  });
});

describe('editor mode', () => {
  it('defaults to view mode for anything that is not "edit"', () => {
    expect(parseEditorMode('edit')).toBe('edit');
    expect(parseEditorMode('view')).toBe('view');
    expect(parseEditorMode(undefined)).toBe('view');
    expect(parseEditorMode(null)).toBe('view');
    expect(parseEditorMode('EDIT')).toBe('view');
    expect(parseEditorMode(1)).toBe('view');
  });

  it('only allows mutations in edit mode', () => {
    expect(canMutateScore('edit')).toBe(true);
    expect(canMutateScore('view')).toBe(false);
  });

  it('toggles', () => {
    expect(otherMode('view')).toBe('edit');
    expect(otherMode('edit')).toBe('view');
  });
});

describe('loop range', () => {
  it('normalizes reversed and out-of-range ends', () => {
    expect(normalizeLoopRange({startBar: 5, endBar: 2}, 8)).toEqual({startBar: 2, endBar: 5});
    expect(normalizeLoopRange({startBar: -3, endBar: 99}, 4)).toEqual({startBar: 0, endBar: 3});
    expect(normalizeLoopRange(null, 4)).toBeNull();
    expect(normalizeLoopRange({startBar: 0, endBar: 0}, 0)).toBeNull();
  });

  it('loops the selection when there is one', () => {
    expect(computeLoopRange({
      selectedBarRange: {start: 2, end: 5},
      cursorBarIndex: 0,
      totalBars: 8,
    })).toEqual({startBar: 2, endBar: 5});
  });

  it('loops the cursor bar when there is no selection', () => {
    expect(computeLoopRange({selectedBarRange: null, cursorBarIndex: 3, totalBars: 8}))
      .toEqual({startBar: 3, endBar: 3});
  });

  it('returns null for an empty score', () => {
    expect(computeLoopRange({selectedBarRange: null, cursorBarIndex: 0, totalBars: 0})).toBeNull();
  });

  it('formats a label with 1-based bar numbers', () => {
    expect(formatLoopRange({startBar: 0, endBar: 0})).toBe('Bar 1');
    expect(formatLoopRange({startBar: 2, endBar: 5})).toBe('Bars 3–6');
  });
});

describe('loopRangeToTicks', () => {
  const score = createBlankScore({measureCount: 4, tempo: 120});
  const totalBars = score.masterBars.length;
  // 4/4 at alphaTab's 960 ticks per quarter → 3840 ticks per bar.
  const barTicks = score.masterBars[0].calculateDuration();

  it('uses the tick cache when one is available', () => {
    const lookup = {
      getMasterBarStart: (masterBar: unknown) =>
        score.masterBars.indexOf(masterBar as (typeof score.masterBars)[number]) * barTicks,
    };
    expect(loopRangeToTicks(score, {startBar: 1, endBar: 2}, totalBars, totalBars * barTicks, lookup))
      .toEqual({startTick: barTicks, endTick: 3 * barTicks});
  });

  it('ends the loop at the end of the last looped bar', () => {
    const lookup = {
      getMasterBarStart: (masterBar: unknown) =>
        score.masterBars.indexOf(masterBar as (typeof score.masterBars)[number]) * barTicks,
    };
    // The last bar has no "next bar" to borrow a start tick from.
    expect(loopRangeToTicks(score, {startBar: 3, endBar: 3}, totalBars, 0, lookup))
      .toEqual({startTick: 3 * barTicks, endTick: 4 * barTicks});
  });

  it('measures the bars itself when there is no tick mapping yet', () => {
    expect(loopRangeToTicks(score, {startBar: 0, endBar: 1}, totalBars, 0, null))
      .toEqual({startTick: 0, endTick: 2 * barTicks});
  });

  it('returns null when the range cannot produce a positive span', () => {
    expect(loopRangeToTicks(score, {startBar: 0, endBar: 0}, 0, 0, null)).toBeNull();
  });
});

describe('parseSidebarSections', () => {
  it('returns the defaults for junk', () => {
    expect(parseSidebarSections(undefined)).toEqual(DEFAULT_SIDEBAR_SECTIONS);
    expect(parseSidebarSections(null)).toEqual(DEFAULT_SIDEBAR_SECTIONS);
    expect(parseSidebarSections('tracks')).toEqual(DEFAULT_SIDEBAR_SECTIONS);
    expect(parseSidebarSections([true, false])).toEqual(DEFAULT_SIDEBAR_SECTIONS);
  });

  it('merges known booleans over the defaults and drops the rest', () => {
    const parsed = parseSidebarSections({stems: true, tracks: false, bogus: true, key: 'yes'});
    expect(parsed.stems).toBe(true);
    expect(parsed.tracks).toBe(false);
    expect(parsed.key).toBe(DEFAULT_SIDEBAR_SECTIONS.key);
    expect(parsed).not.toHaveProperty('bogus');
  });
});
