import {describe, it, expect, vi} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useEditorCursor} from '../useEditorCursor';
import {createBlankScore} from '../newScore';
import {addBeatAfter, setBeatDuration} from '../scoreOperations';
import {model} from '@coderline/alphatab';
import type {AlphaTabApi} from '@coderline/alphatab';

const {Duration} = model;

function makeApiRef(overrides: Partial<AlphaTabApi> = {}) {
  const ref = {current: null as AlphaTabApi | null};
  ref.current = {
    boundsLookup: {
      findBeat: vi.fn(() => ({
        visualBounds: {x: 10, y: 20, w: 50, h: 30},
      })),
    },
    ...overrides,
  } as unknown as AlphaTabApi;
  return ref;
}

/** Shared setup helper — creates an apiRef, renders the hook, and calls setScore. */
function setup(measureCount = 2) {
  const apiRef = makeApiRef();
  const score = createBlankScore({measureCount, tempo: 120});
  const {result} = renderHook(() => useEditorCursor({current: apiRef.current}));
  act(() => result.current.setScore(score));
  return {result, score, apiRef};
}

describe('useEditorCursor', () => {
  describe('initial state', () => {
    it('starts at bar 0, beat 0, string 1', () => {
      const apiRef = makeApiRef();
      const {result} = renderHook(() => useEditorCursor({current: apiRef.current}));
      expect(result.current.cursor).toEqual({
        trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringNumber: 1,
      });
    });

    it('cursorBounds is null before setScore is called', () => {
      const apiRef = makeApiRef();
      const {result} = renderHook(() => useEditorCursor({current: apiRef.current}));
      expect(result.current.cursorBounds).toBeNull();
    });
  });

  describe('moveUp / moveDown — string navigation', () => {
    it('moveUp increments stringNumber', () => {
      const {result} = setup();
      act(() => result.current.moveUp());
      expect(result.current.cursor.stringNumber).toBe(2);
    });

    it('moveDown decrements stringNumber', () => {
      const {result} = setup();
      // Move up first so we have room to move down
      act(() => result.current.moveUp());
      act(() => result.current.moveDown());
      expect(result.current.cursor.stringNumber).toBe(1);
    });

    it('moveDown does not go below string 1', () => {
      const {result} = setup();
      act(() => result.current.moveDown());
      expect(result.current.cursor.stringNumber).toBe(1);
    });

    it('moveUp does not exceed string count', () => {
      const {result} = setup();
      // Default 6-string guitar — call moveUp 10 times
      for (let i = 0; i < 10; i++) act(() => result.current.moveUp());
      expect(result.current.cursor.stringNumber).toBeLessThanOrEqual(6);
    });
  });

  describe('moveLeft / moveRight — beat navigation', () => {
    it('moveRight advances beatIndex when bar has multiple beats', () => {
      const {result, score} = setup();
      // Add a second beat so bar 0 has beats at index 0 and 1
      // Blank score starts with whole rests — shrink to quarter so bar has room for a second beat
      const cur0 = {trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringNumber: 1};
      setBeatDuration(score, cur0, Duration.Quarter);
      addBeatAfter(score, cur0, Duration.Quarter);
      act(() => result.current.setScore(score));
      act(() => result.current.moveRight());
      expect(result.current.cursor.beatIndex).toBe(1);
      expect(result.current.cursor.barIndex).toBe(0);
    });

    it('moveLeft does nothing at the start', () => {
      const {result} = setup();
      act(() => result.current.moveLeft());
      expect(result.current.cursor.beatIndex).toBe(0);
      expect(result.current.cursor.barIndex).toBe(0);
    });

    it('moveRight wraps to next bar', () => {
      const {result, score} = setup();
      // Move to last beat of bar 0
      const bar0beats = score.tracks[0].staves[0].bars[0].voices[0].beats.length;
      for (let i = 0; i < bar0beats - 1; i++) act(() => result.current.moveRight());
      act(() => result.current.moveRight());
      expect(result.current.cursor.barIndex).toBe(1);
      expect(result.current.cursor.beatIndex).toBe(0);
    });
  });

  describe('moveTo', () => {
    it('updates cursor state', () => {
      const {result} = setup(4);
      act(() => result.current.moveTo({
        trackIndex: 0, barIndex: 2, voiceIndex: 0, beatIndex: 0, stringNumber: 3,
      }));
      expect(result.current.cursor).toEqual({
        trackIndex: 0, barIndex: 2, voiceIndex: 0, beatIndex: 0, stringNumber: 3,
      });
    });

    it('updates cursorBounds when api.boundsLookup returns bounds', () => {
      const {result} = setup();
      act(() => result.current.moveTo({
        trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringNumber: 1,
      }));
      expect(result.current.cursorBounds).toEqual({x: 10, y: 20, width: 50, height: 30});
    });

    it('sets cursorBounds to null when boundsLookup returns nothing', () => {
      const apiRef = makeApiRef({
        boundsLookup: {findBeat: vi.fn(() => null)} as never,
      });
      const score = createBlankScore({measureCount: 2, tempo: 120});
      const {result} = renderHook(() => useEditorCursor({current: apiRef.current}));
      act(() => result.current.setScore(score));
      act(() => result.current.moveTo({
        trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringNumber: 1,
      }));
      expect(result.current.cursorBounds).toBeNull();
    });
  });

  describe('handleBeatClick', () => {
    it('moves cursor to the clicked beat', () => {
      const {result, score} = setup(4);

      // Click the beat at bar 2
      const beat = score.tracks[0].staves[0].bars[2].voices[0].beats[0];
      act(() => result.current.handleBeatClick(beat));

      expect(result.current.cursor.barIndex).toBe(2);
      expect(result.current.cursor.beatIndex).toBe(0);
    });

    it('preserves current stringNumber on beat click', () => {
      const {result, score} = setup(4);
      act(() => result.current.moveUp()); // stringNumber = 2

      const beat = score.tracks[0].staves[0].bars[1].voices[0].beats[0];
      act(() => result.current.handleBeatClick(beat));

      expect(result.current.cursor.stringNumber).toBe(2);
      expect(result.current.cursor.barIndex).toBe(1);
    });
  });

  describe('moveToNextMeasure / moveToPrevMeasure', () => {
    it('moveToNextMeasure advances barIndex', () => {
      const {result} = setup(4);
      act(() => result.current.moveToNextMeasure());
      expect(result.current.cursor.barIndex).toBe(1);
      expect(result.current.cursor.beatIndex).toBe(0);
    });

    it('moveToPrevMeasure decrements barIndex', () => {
      const {result} = setup(4);
      act(() => result.current.moveToNextMeasure());
      act(() => result.current.moveToPrevMeasure());
      expect(result.current.cursor.barIndex).toBe(0);
    });

    it('moveToPrevMeasure does nothing at bar 0', () => {
      const {result} = setup(4);
      act(() => result.current.moveToPrevMeasure());
      expect(result.current.cursor.barIndex).toBe(0);
    });

    it('moveToNextMeasure does nothing at last bar', async () => {
      const {result} = setup(2);
      // Navigate to last bar (bar index 1)
      act(() => result.current.moveToNextMeasure());
      expect(result.current.cursor.barIndex).toBe(1);
      // Try to go past last bar — should stay at 1
      act(() => result.current.moveToNextMeasure());
      expect(result.current.cursor.barIndex).toBe(1);
    });
  });
});
