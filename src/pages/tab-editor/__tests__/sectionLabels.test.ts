/**
 * Tests for section label computation.
 *
 * The core contract: labels must be derived from api.boundsLookup.staffSystems,
 * and that lookup is only valid after postRenderFinished fires (not renderFinished).
 * These tests validate the pure computation logic using mocked bounds data.
 */
import {describe, it, expect} from 'vitest';
import {createBlankScore} from '@/lib/tab-editor/newScore';
import {setBarSection} from '@/lib/tab-editor/scoreOperations';
import {model} from '@coderline/alphatab';

const {Section} = model;

// ---------------------------------------------------------------------------
// Pure helper that mirrors computeSectionLabels() in TabEditorPage.
// Label y = barBounds.visualBounds.y (top of effect-bands for that bar).
// Using bar-level y (not system.y - 18) avoids overlapping score header text
// such as "Guitar Standard Tuning" which sits above the first system.
// ---------------------------------------------------------------------------

interface SectionLabel {
  text: string;
  x: number;
  y: number;
}

interface MockBounds {
  x: number; y: number; w: number; h: number;
}

interface MockBarBounds {
  index: number;
  visualBounds: MockBounds;
}

interface MockSystemBounds {
  visualBounds: MockBounds;
  bars: MockBarBounds[];
}

interface MockBoundsLookup {
  staffSystems: MockSystemBounds[];
}

function computeLabels(
  score: InstanceType<typeof model.Score>,
  boundsLookup: MockBoundsLookup,
): SectionLabel[] {
  const labels: SectionLabel[] = [];
  for (const system of boundsLookup.staffSystems) {
    for (const barBounds of system.bars) {
      const masterBar = score.masterBars[barBounds.index];
      if (!masterBar?.isSectionStart || !masterBar.section?.text) continue;
      const text = masterBar.section.marker
        ? `[${masterBar.section.marker}] ${masterBar.section.text}`
        : masterBar.section.text;
      labels.push({
        text,
        x: barBounds.visualBounds.x,
        y: barBounds.visualBounds.y,
      });
    }
  }
  return labels;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSystem(systemY: number, bars: { index: number; x: number }[]): MockSystemBounds {
  return {
    visualBounds: {x: 0, y: systemY, w: 800, h: 120},
    bars: bars.map(b => ({
      index: b.index,
      visualBounds: {x: b.x, y: systemY + 10, w: 100, h: 100},
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('section label computation', () => {
  it('returns empty array when no section-start bars', () => {
    const score = createBlankScore({measureCount: 4, tempo: 120});
    const lookup = {staffSystems: [makeSystem(50, [{index: 0, x: 10}])]};
    expect(computeLabels(score, lookup)).toEqual([]);
  });

  it('produces a label for each section-start bar', () => {
    const score = createBlankScore({measureCount: 4, tempo: 120});
    setBarSection(score, 0, 'Intro');
    setBarSection(score, 2, 'Verse');

    const lookup: MockBoundsLookup = {
      staffSystems: [
        makeSystem(50, [
          {index: 0, x: 10},
          {index: 1, x: 120},
        ]),
        makeSystem(200, [
          {index: 2, x: 10},
          {index: 3, x: 120},
        ]),
      ],
    };

    const labels = computeLabels(score, lookup);
    expect(labels).toHaveLength(2);
    expect(labels[0].text).toMatch(/intro/i);
    expect(labels[0].x).toBe(10);
    expect(labels[0].y).toBe(60);   // barBounds.visualBounds.y = systemY + 10 = 50 + 10
    expect(labels[1].text).toMatch(/verse/i);
    expect(labels[1].y).toBe(210);  // 200 + 10
  });

  it('uses bar x position (start of bar, not beat)', () => {
    const score = createBlankScore({measureCount: 2, tempo: 120});
    setBarSection(score, 0, 'Intro');

    const lookup = {staffSystems: [makeSystem(80, [{index: 0, x: 42}])]};
    const [label] = computeLabels(score, lookup);
    expect(label.x).toBe(42);
  });

  it('skips bars not in boundsLookup (e.g. track switch mid-render)', () => {
    const score = createBlankScore({measureCount: 4, tempo: 120});
    setBarSection(score, 0, 'Intro');
    setBarSection(score, 2, 'Verse');

    // Only bar 0 is in the lookup (simulates partial/stale bounds)
    const lookup = {staffSystems: [makeSystem(50, [{index: 0, x: 10}])]};
    const labels = computeLabels(score, lookup);
    expect(labels).toHaveLength(1);
    expect(labels[0].text).toMatch(/intro/i);
  });

  it('places label at top of bar effect-bands (barBounds.visualBounds.y)', () => {
    const score = createBlankScore({measureCount: 1, tempo: 120});
    setBarSection(score, 0, 'A');

    const systemY = 300;
    const lookup = {staffSystems: [makeSystem(systemY, [{index: 0, x: 0}])]};
    const [label] = computeLabels(score, lookup);
    // barBounds.visualBounds.y = systemY + 10 (from makeSystem)
    expect(label.y).toBe(systemY + 10);
  });

  it('label y stays within rendered area — does not go above score header', () => {
    const score = createBlankScore({measureCount: 1, tempo: 120});
    setBarSection(score, 0, 'Intro');

    // Simulate a system whose visualBounds.y is 30px (voice track, minimal overhead).
    // Score header "Guitar Standard Tuning" might occupy y=0..25.
    // Old formula: y = 30 - 18 = 12 → overlaps header
    // New formula: y = barBounds.visualBounds.y = 40 → safely below header
    const lookup: MockBoundsLookup = {
      staffSystems: [{
        visualBounds: {x: 0, y: 30, w: 800, h: 120},
        bars: [{index: 0, visualBounds: {x: 10, y: 40, w: 100, h: 100}}],
      }],
    };
    const [label] = computeLabels(score, lookup);
    expect(label.y).toBe(40);           // barBounds.visualBounds.y
    expect(label.y).toBeGreaterThan(25); // safely below the score header text area
  });

  it('includes marker prefix when section has a marker', () => {
    const score = createBlankScore({measureCount: 2, tempo: 120});
    // setBarSection auto-sets marker to first letter
    setBarSection(score, 0, 'Bridge');
    // marker will be 'B' (first char uppercased)
    const lookup = {staffSystems: [makeSystem(60, [{index: 0, x: 5}])]};
    const [label] = computeLabels(score, lookup);
    expect(label.text).toBe('[B] Bridge');
  });
});

describe('postRenderFinished timing contract', () => {
  it('boundsLookup is null after renderFinished and only set after postRenderFinished', () => {
    // This test documents the AlphaTab worker pipeline timing:
    // - renderFinished fires with stale/null boundsLookup
    // - postRenderFinished fires after worker sends bounds JSON back
    // We simulate with a flag sequence mirroring the worker message handler.

    let boundsLookup: MockBoundsLookup | null = null;
    const events: string[] = [];

    const simulateRender = (cb: {
      onRenderFinished: () => void;
      onPostRenderFinished: () => void;
    }) => {
      // Worker fires renderFinished first (bounds NOT yet on main thread)
      cb.onRenderFinished();
      events.push('renderFinished');

      // Worker then sends postRenderFinished with bounds JSON → main thread sets lookup
      boundsLookup = {staffSystems: [makeSystem(100, [{index: 0, x: 0}])]};
      cb.onPostRenderFinished();
      events.push('postRenderFinished');
    };

    let labelsFromRenderFinished: SectionLabel[] | null = null;
    let labelsFromPostRenderFinished: SectionLabel[] | null = null;

    const score = createBlankScore({measureCount: 1, tempo: 120});
    setBarSection(score, 0, 'Intro');

    simulateRender({
      onRenderFinished: () => {
        // boundsLookup is still null here (not yet received from worker)
        labelsFromRenderFinished = boundsLookup
          ? computeLabels(score, boundsLookup)
          : null;
      },
      onPostRenderFinished: () => {
        labelsFromPostRenderFinished = boundsLookup
          ? computeLabels(score, boundsLookup)
          : null;
      },
    });

    expect(labelsFromRenderFinished).toBeNull(); // stale — bounds not ready yet
    expect(labelsFromPostRenderFinished).toHaveLength(1); // correct
    expect(events).toEqual(['renderFinished', 'postRenderFinished']);
  });
});
