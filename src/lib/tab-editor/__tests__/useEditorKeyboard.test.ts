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
  describe('accents (A key)', () => {
    it('cycles the whole beat through none → accent → heavy → none', async () => {
      const {model} = await import('@coderline/alphatab');
      const {setNote} = await import('../scoreOperations');
      const opts = makeOptions({onToast: vi.fn(), onBeforeMutation: vi.fn()});
      for (const stringNumber of [1, 2, 3]) {
        setNote(opts.score, makeCursor({stringNumber}), 3);
      }
      renderHook(() => useEditorKeyboard(opts));

      const notes = () => opts.score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes;

      act(() => { fireKey('a'); });
      expect(notes().every(n => n.accentuated === model.AccentuationType.Normal)).toBe(true);
      // The undo snapshot must be taken before the change.
      expect(opts.onBeforeMutation).toHaveBeenCalledOnce();
      expect(opts.onScoreChanged).toHaveBeenCalledOnce();

      act(() => { fireKey('a'); });
      expect(notes().every(n => n.accentuated === model.AccentuationType.Heavy)).toBe(true);

      act(() => { fireKey('a'); });
      expect(notes().every(n => n.accentuated === model.AccentuationType.None)).toBe(true);
    });

    it('warns instead of mutating when the beat is empty', () => {
      const opts = makeOptions({onToast: vi.fn()});
      renderHook(() => useEditorKeyboard(opts));

      act(() => { fireKey('a'); });

      expect(opts.onToast).toHaveBeenCalledWith('No notes on this beat to accent');
      expect(opts.onScoreChanged).not.toHaveBeenCalled();
    });

    it('leaves Cmd+A for select-all', () => {
      const opts = makeOptions({onSelectAllBars: vi.fn(), onToast: vi.fn()});
      renderHook(() => useEditorKeyboard(opts));

      act(() => { fireKey('a', {metaKey: true}); });

      expect(opts.onSelectAllBars).toHaveBeenCalledOnce();
      expect(opts.onToast).not.toHaveBeenCalled();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fingering (Alt chords)', () => {
    it('maps Alt+P/I/M/A to the right hand, by code not key', () => {
      const opts = makeOptions({onRightHandFinger: vi.fn()});
      renderHook(() => useEditorKeyboard(opts));
      // macOS turns Alt+P into 'π' — the handler must read event.code instead
      fireKey('π', {altKey: true, code: 'KeyP'});
      fireKey('å', {altKey: true, code: 'KeyA'});
      expect(opts.onRightHandFinger).toHaveBeenNthCalledWith(1, 'p');
      expect(opts.onRightHandFinger).toHaveBeenNthCalledWith(2, 'a');
    });

    it('maps Alt+1..4 to the left hand and Alt+0 to clear', () => {
      const opts = makeOptions({onLeftHandFinger: vi.fn(), onClearFingering: vi.fn()});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('3', {altKey: true, code: 'Digit3'});
      fireKey('0', {altKey: true, code: 'Digit0'});
      expect(opts.onLeftHandFinger).toHaveBeenCalledWith('3');
      expect(opts.onClearFingering).toHaveBeenCalledOnce();
    });

    it('Alt+F toggles the fingering display', () => {
      const opts = makeOptions({onToggleFingering: vi.fn()});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('ƒ', {altKey: true, code: 'KeyF'});
      expect(opts.onToggleFingering).toHaveBeenCalledOnce();
    });

    it('Alt+S toggles the strumming pattern strip', () => {
      const opts = makeOptions({onToggleStrumming: vi.fn()});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('ß', {altKey: true, code: 'KeyS'});
      expect(opts.onToggleStrumming).toHaveBeenCalledOnce();
    });

    it('plain digits still enter frets, not fingerings', () => {
      const opts = makeOptions({onLeftHandFinger: vi.fn()});
      renderHook(() => useEditorKeyboard(opts));
      const event = fireKey('3', {code: 'Digit3'});
      expect(opts.onLeftHandFinger).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('plain P still toggles hammer-on, not the thumb', () => {
      const opts = makeOptions({onRightHandFinger: vi.fn()});
      renderHook(() => useEditorKeyboard(opts));
      fireKey('p', {code: 'KeyP'});
      expect(opts.onRightHandFinger).not.toHaveBeenCalled();
    });
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
      const event = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true});
      input.dispatchEvent(event);
      expect(opts.onPlayPause).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      document.body.removeChild(input);
    });

    it.each(['textarea', 'select'])('leaves Space to a focused %s', tag => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      const field = document.createElement(tag);
      document.body.appendChild(field);
      field.focus();
      const event = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true});
      field.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(opts.onPlayPause).not.toHaveBeenCalled();
      field.remove();
    });

    it('does not intercept events from children of a contenteditable field', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      const editable = document.createElement('div');
      editable.setAttribute('contenteditable', 'true');
      const text = editable.appendChild(document.createElement('span'));
      document.body.appendChild(editable);
      const event = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true});
      text.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(opts.onPlayPause).not.toHaveBeenCalled();
      editable.remove();
    });

    it('leaves modal buttons to handle Space without toggling playback', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      const button = dialog.appendChild(document.createElement('button'));
      document.body.appendChild(dialog);
      const event = new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true});
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(opts.onPlayPause).not.toHaveBeenCalled();
      dialog.remove();
    });

    it('toggles only once when Space is held down', () => {
      const opts = makeOptions();
      renderHook(() => useEditorKeyboard(opts));
      fireKey(' ');
      const repeated = fireKey(' ', {repeat: true});
      expect(opts.onPlayPause).toHaveBeenCalledOnce();
      expect(repeated.defaultPrevented).toBe(true);
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

  describe('practice shortcuts', () => {
    function practiceOptions(overrides: Record<string, unknown> = {}) {
      return makeOptions({
        onToggleMode: vi.fn(),
        onToggleLoop: vi.fn(),
        onToggleSidebar: vi.fn(),
        onAdjustSpeed: vi.fn(),
        onResetSpeed: vi.fn(),
        ...overrides,
      });
    }

    it.each([
      ['Alt+E', 'KeyE', 'onToggleMode'],
      ['Alt+L', 'KeyL', 'onToggleLoop'],
      ['Alt+B', 'KeyB', 'onToggleSidebar'],
    ])('%s fires %s', (_label, code, handler) => {
      const opts = practiceOptions();
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey('e', {altKey: true, code}); });
      expect(opts[handler as keyof typeof opts]).toHaveBeenCalledOnce();
    });

    it('[ and ] step the playback speed, \\ resets it', () => {
      const opts = practiceOptions();
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey(']'); });
      act(() => { fireKey('['); });
      act(() => { fireKey('\\'); });
      expect(opts.onAdjustSpeed).toHaveBeenNthCalledWith(1, 5);
      expect(opts.onAdjustSpeed).toHaveBeenNthCalledWith(2, -5);
      expect(opts.onResetSpeed).toHaveBeenCalledOnce();
    });

    it('still works in view mode — speed and looping are not edits', () => {
      const opts = practiceOptions({readOnly: true});
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey('l', {altKey: true, code: 'KeyL'}); });
      act(() => { fireKey(']'); });
      expect(opts.onToggleLoop).toHaveBeenCalledOnce();
      expect(opts.onAdjustSpeed).toHaveBeenCalledOnce();
    });
  });

  describe('view mode gating', () => {
    function viewOptions(overrides: Record<string, unknown> = {}) {
      return makeOptions({
        readOnly: true,
        onToast: vi.fn(),
        onBeforeMutation: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onClearSelectedBars: vi.fn(),
        onAdvanceBeat: vi.fn(),
        onDrumHit: vi.fn(),
        onShowChordFinder: vi.fn(),
        onRightHandFinger: vi.fn(),
        onLeftHandFinger: vi.fn(),
        onClearFingering: vi.fn(),
        ...overrides,
      });
    }

    const beats = (opts: ReturnType<typeof makeOptions>) =>
      opts.score.tracks[0].staves[0].bars[0].voices[0].beats;

    it('ignores fret entry', async () => {
      const opts = viewOptions();
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey('3'); });
      await new Promise(resolve => setTimeout(resolve, 600));
      expect(opts.onScoreChanged).not.toHaveBeenCalled();
      expect(beats(opts)[0].notes.length).toBe(0);
    });

    it.each([
      ['effect key', 'h', {}],
      ['rest', 'r', {}],
      ['accent', 'a', {}],
      ['dot', '.', {}],
      ['add measure', '+', {}],
      ['delete measure', '-', {}],
      ['duration', '3', {ctrlKey: true}],
      ['delete', 'Delete', {}],
      ['backspace', 'Backspace', {}],
      ['cut', 'x', {metaKey: true}],
      ['paste', 'v', {metaKey: true}],
    ])('ignores %s', (_label, key, modifiers) => {
      const opts = viewOptions();
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey(key, modifiers); });
      expect(opts.onScoreChanged).not.toHaveBeenCalled();
      expect(opts.onBeforeMutation).not.toHaveBeenCalled();
    });

    it('ignores undo and redo', () => {
      const opts = viewOptions();
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey('z', {metaKey: true}); });
      act(() => { fireKey('z', {metaKey: true, shiftKey: true}); });
      expect(opts.onUndo).not.toHaveBeenCalled();
      expect(opts.onRedo).not.toHaveBeenCalled();
    });

    it('ignores the chord finder, drum pads and beat insertion', () => {
      const opts = viewOptions({isDrumTrack: true});
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey('k', {metaKey: true}); });
      act(() => { fireKey('l'); });
      expect(opts.onShowChordFinder).not.toHaveBeenCalled();
      expect(opts.onDrumHit).not.toHaveBeenCalled();
      expect(opts.onAdvanceBeat).not.toHaveBeenCalled();
    });

    it('ignores fingering entry but keeps the fingering display toggle', () => {
      const opts = viewOptions({onToggleFingering: vi.fn(), onToggleStrumming: vi.fn()});
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey('p', {altKey: true, code: 'KeyP'}); });
      act(() => { fireKey('1', {altKey: true, code: 'Digit1'}); });
      act(() => { fireKey('0', {altKey: true, code: 'Digit0'}); });
      act(() => { fireKey('f', {altKey: true, code: 'KeyF'}); });
      act(() => { fireKey('s', {altKey: true, code: 'KeyS'}); });
      expect(opts.onRightHandFinger).not.toHaveBeenCalled();
      expect(opts.onLeftHandFinger).not.toHaveBeenCalled();
      expect(opts.onClearFingering).not.toHaveBeenCalled();
      expect(opts.onToggleFingering).toHaveBeenCalledOnce();
      expect(opts.onToggleStrumming).toHaveBeenCalledOnce();
    });

    it('keeps navigation, playback, scrolling, copy and help working', () => {
      const opts = viewOptions({
        onScrollUp: vi.fn(),
        onScrollDown: vi.fn(),
        onShowHelp: vi.fn(),
        onSelectAllBars: vi.fn(),
      });
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey(' '); });
      act(() => { fireKey('ArrowLeft'); });
      act(() => { fireKey('ArrowUp'); });
      act(() => { fireKey('ArrowDown'); });
      act(() => { fireKey('u'); });
      act(() => { fireKey('d'); });
      act(() => { fireKey('?'); });
      act(() => { fireKey('a', {metaKey: true}); });
      act(() => { fireKey('c', {metaKey: true}); });
      expect(opts.onPlayPause).toHaveBeenCalledOnce();
      expect(opts.moveLeft).toHaveBeenCalledOnce();
      expect(opts.moveUp).toHaveBeenCalledOnce();
      expect(opts.moveDown).toHaveBeenCalledOnce();
      expect(opts.onScrollUp).toHaveBeenCalledOnce();
      expect(opts.onScrollDown).toHaveBeenCalledOnce();
      expect(opts.onShowHelp).toHaveBeenCalledOnce();
      expect(opts.onSelectAllBars).toHaveBeenCalledOnce();
      expect(opts.onScoreChanged).not.toHaveBeenCalled();
    });

    it('moves right without growing the bar', () => {
      const opts = viewOptions();
      const beatCount = beats(opts).length;
      renderHook(() => useEditorKeyboard(opts));
      act(() => { fireKey('ArrowRight'); });
      expect(opts.moveRight).toHaveBeenCalledOnce();
      expect(beats(opts).length).toBe(beatCount);
      expect(opts.onScoreChanged).not.toHaveBeenCalled();
    });
  });
});
