import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, act} from '@testing-library/react';
import {useEditorKeyboard} from '../useEditorKeyboard';
import {createBlankScore} from '../newScore';
import {setBeatDuration} from '../scoreOperations';
import type {EditorCursor} from '../useEditorCursor';

function makeCursor(overrides?: Partial<EditorCursor>): EditorCursor {
  return {trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringNumber: 1, ...overrides};
}

function fireKey(key: string, opts: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...opts});
  window.dispatchEvent(event);
  return event;
}

function makeOptions(overrides: Record<string, unknown> = {}) {
  const score = createBlankScore({measureCount: 4, tempo: 120});
  return {
    score,
    cursor: makeCursor(),
    moveLeft: vi.fn(),
    moveRight: vi.fn(),
    moveUp: vi.fn(),
    moveDown: vi.fn(),
    moveToNextMeasure: vi.fn(),
    moveToPrevMeasure: vi.fn(),
    moveTo: vi.fn(),
    onScoreChanged: vi.fn(),
    onPlayPause: vi.fn(),
    currentDuration: 4,
    setCurrentDuration: vi.fn(),
    ...overrides,
  };
}

describe('useEditorKeyboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('space bar', () => {
    it('calls onPlayPause', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      fireKey(' ');
      expect(opts.onPlayPause).toHaveBeenCalledOnce();
    });

    it('prevents default (no browser scroll)', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      const event = fireKey(' ');
      expect(event.defaultPrevented).toBe(true);
    });

    it('does not fire when typing in an input', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      const input = document.createElement('input');
      input.type = 'text';
      document.body.appendChild(input);
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
      expect(opts.onPlayPause).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });
  });

  describe('arrow keys — string navigation', () => {
    it('ArrowUp calls moveUp and prevents default', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      const event = fireKey('ArrowUp');
      expect(opts.moveUp).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    });

    it('ArrowDown calls moveDown and prevents default', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      const event = fireKey('ArrowDown');
      expect(opts.moveDown).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    });

    it('ArrowLeft calls moveLeft and prevents default', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      const event = fireKey('ArrowLeft');
      expect(opts.moveLeft).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    });

    it('ArrowRight calls moveRight and prevents default', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      const event = fireKey('ArrowRight');
      expect(opts.moveRight).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    });

    it('Ctrl+ArrowLeft calls moveToPrevMeasure', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      fireKey('ArrowLeft', {ctrlKey: true});
      expect(opts.moveToPrevMeasure).toHaveBeenCalledOnce();
      expect(opts.moveLeft).not.toHaveBeenCalled();
    });

    it('Ctrl+ArrowRight calls moveToNextMeasure', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      fireKey('ArrowRight', {ctrlKey: true});
      expect(opts.moveToNextMeasure).toHaveBeenCalledOnce();
      expect(opts.moveRight).not.toHaveBeenCalled();
    });
  });

  describe('D/U scroll keys', () => {
    it('d key calls onScrollDown and prevents default', () => {
      const onScrollDown = vi.fn();
      const opts = makeOptions({onScrollDown});
      renderHook(() => useEditorKeyboard(opts));
      const event = fireKey('d');
      expect(onScrollDown).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    });

    it('uppercase D key calls onScrollDown', () => {
      const onScrollDown = vi.fn();
      const opts = makeOptions({onScrollDown});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('D');
      expect(onScrollDown).toHaveBeenCalledOnce();
    });

    it('D key with shiftKey calls onScrollDown', () => {
      const onScrollDown = vi.fn();
      const opts = makeOptions({onScrollDown});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('D', {shiftKey: true});
      expect(onScrollDown).toHaveBeenCalledOnce();
    });

    it('u key calls onScrollUp and prevents default', () => {
      const onScrollUp = vi.fn();
      const opts = makeOptions({onScrollUp});
      renderHook(() => useEditorKeyboard(opts));
      const event = fireKey('u');
      expect(onScrollUp).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    });

    it('Ctrl+d does not trigger scroll (modifier reserved)', () => {
      const onScrollDown = vi.fn();
      const opts = makeOptions({onScrollDown});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('d', {ctrlKey: true});
      expect(onScrollDown).not.toHaveBeenCalled();
    });

    it('is a no-op when callback not provided', () => {
      const opts = makeOptions();
      // Should not throw even if onScrollDown/onScrollUp are undefined
      renderHook(() => useEditorKeyboard(opts));
      expect(() => fireKey('d')).not.toThrow();
      expect(() => fireKey('u')).not.toThrow();
    });
  });

  describe('fret digit input', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('single digit commits after 500ms timeout', async () => {
      const onScoreChanged = vi.fn();
      const score = createBlankScore({measureCount: 4, tempo: 120});
      const opts = makeOptions({score, onScoreChanged});
      renderHook(() => useEditorKeyboard(opts));

      act(() => { fireKey('5'); });
      // Before timeout: not yet committed
      expect(onScoreChanged).not.toHaveBeenCalled();

      // Advance past the 500ms fret timeout
      act(() => { vi.advanceTimersByTime(500); });

      // After timeout: score changed should have been called
      expect(onScoreChanged).toHaveBeenCalled();
    });

    it('two digits commit immediately on second digit', () => {
      const onScoreChanged = vi.fn();
      const score = createBlankScore({measureCount: 4, tempo: 120});
      const opts = makeOptions({score, onScoreChanged});
      renderHook(() => useEditorKeyboard(opts));

      act(() => { fireKey('1'); });
      expect(onScoreChanged).not.toHaveBeenCalled();

      act(() => { fireKey('2'); });
      // Two digits → immediate commit without waiting for timeout
      expect(onScoreChanged).toHaveBeenCalled();
    });
  });

  describe('ArrowRight at last beat', () => {
    it('calls moveRight when bar is full (addBeatAfter returns null)', () => {
      const moveRight = vi.fn();
      const onScoreChanged = vi.fn();
      const score = createBlankScore({measureCount: 4, tempo: 120});
      // Default blank score: bar 0 has a single whole-rest (bar is full)
      // → addBeatAfter returns null → falls back to moveRight
      const cursor = makeCursor({barIndex: 0, beatIndex: 0});
      const opts = makeOptions({score, cursor, moveRight, onScoreChanged});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('ArrowRight');
      expect(moveRight).toHaveBeenCalled();
    });

    it('calls moveTo when bar has room (addBeatAfter succeeds)', () => {
      const moveTo = vi.fn();
      const onScoreChanged = vi.fn();
      const score = createBlankScore({measureCount: 4, tempo: 120});
      // Shrink bar 0 beat 0 to a quarter note so bar has room for more beats
      // Duration.Quarter = 4
      setBeatDuration(score, {trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringNumber: 1}, 4);
      // currentDuration=4 means quarter note — addBeatAfter should succeed
      const cursor = makeCursor({barIndex: 0, beatIndex: 0});
      const opts = makeOptions({score, cursor, moveTo, onScoreChanged, currentDuration: 4});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('ArrowRight');
      expect(moveTo).toHaveBeenCalled();
    });
  });

  describe('undo/redo', () => {
    it('Ctrl+Z calls onUndo', () => {
      const onUndo = vi.fn();
      const opts = makeOptions({onUndo});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('z', {ctrlKey: true});
      expect(onUndo).toHaveBeenCalledOnce();
    });

    it('Ctrl+Shift+Z calls onRedo', () => {
      const onRedo = vi.fn();
      const opts = makeOptions({onRedo});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('z', {ctrlKey: true, shiftKey: true});
      expect(onRedo).toHaveBeenCalledOnce();
    });
  });

  describe('event capture', () => {
    it('handler is registered in capture phase (fires before bubbling handlers)', () => {
      const captureOrder: string[] = [];
      const opts = makeOptions({
        onPlayPause: vi.fn(() => captureOrder.push('capture-handler')),
      });
      renderHook(() => useEditorKeyboard(opts));

      // This bubbling handler should fire AFTER our capture handler
      const bubblingHandler = () => captureOrder.push('bubble-handler');
      window.addEventListener('keydown', bubblingHandler, false);

      fireKey(' ');
      window.removeEventListener('keydown', bubblingHandler, false);

      expect(captureOrder[0]).toBe('capture-handler');
      expect(captureOrder[1]).toBe('bubble-handler');
    });
  });

  describe('hook cleanup', () => {
    it('removes listener on unmount', () => {
      const opts = makeOptions();
      const {unmount} = renderHook(() => useEditorKeyboard(opts));
      unmount();
      fireKey(' ');
      expect(opts.onPlayPause).not.toHaveBeenCalled();
    });
  });
});
