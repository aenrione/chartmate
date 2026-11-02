import {useEffect, useRef, useCallback} from 'react';
import {model} from '@coderline/alphatab';
import type {EditorCursor} from './useEditorCursor';
import {DRUM_SHORTCUTS, getDrumLane} from './drumMap';
import {
  setNoteAndAdvance,
  removeNote,
  insertRest,
  setBeatDuration,
  toggleDot,
  toggleEffect,
  toggleSlide,
  toggleBend,
  cycleBeatAccent,
  insertMeasureAfter,
  deleteMeasure,
  addBeatAfter,
  removeBeat,
  copyCell,
  copyBeat,
  pasteCell,
  pasteBeat,
  cutCell,
  cutBeat,
  type ClipboardCell,
  type ClipboardBeat,
  type NoteEffect,
  Duration,
} from './scoreOperations';
import {
  LEFT_HAND_FINGERS,
  type LeftHandFinger,
  type RightHandFinger,
} from './fingering';

type Score = InstanceType<typeof model.Score>;

interface UseEditorKeyboardOptions {
  score: Score | null;
  cursor: EditorCursor;
  moveLeft: () => void;
  moveRight: () => void;
  moveUp: () => void;
  moveDown: () => void;
  moveToNextMeasure: () => void;
  moveToPrevMeasure: () => void;
  moveTo: (cursor: EditorCursor) => void;
  onScoreChanged: () => void;
  onPlayPause: () => void;
  onShowHelp?: () => void;
  onAdvanceBeat?: () => void;
  onDrumHit?: (midiNote: number) => void;
  isDrumTrack?: boolean;
  currentDuration: number;
  setCurrentDuration: (d: number) => void;
  onShowChordFinder?: () => void;
  onToast?: (message: string) => void;
  onBeforeMutation?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onScrollUp?: () => void;
  onScrollDown?: () => void;
  selectedBarRange?: {start: number; end: number} | null;
  onSelectAllBars?: () => void;
  onClearSelectedBars?: () => void;
  onClearBarSelection?: () => void;
  /** Alt+P / Alt+I / Alt+M / Alt+A — right-hand (plucking) finger. */
  onRightHandFinger?: (finger: RightHandFinger) => void;
  /** Alt+1 … Alt+4 — left-hand (fretting) finger. */
  onLeftHandFinger?: (finger: LeftHandFinger) => void;
  /** Alt+0 — remove both fingerings from the note under the cursor. */
  onClearFingering?: () => void;
  /** Alt+F — show/hide fingering in the score. */
  onToggleFingering?: () => void;
  /** Alt+S — show/hide the strumming pattern strip. */
  onToggleStrumming?: () => void;
  /**
   * View mode. Every key that would change the score is inert; navigation,
   * playback, looping, speed, scrolling and the display toggles still work.
   */
  readOnly?: boolean;
  /** Alt+E — switch between View and Edit mode. */
  onToggleMode?: () => void;
  /** Alt+L — loop the selected bars, or the cursor's bar; again to clear. */
  onToggleLoop?: () => void;
  /** Alt+B — collapse / restore the sidebar. */
  onToggleSidebar?: () => void;
  /** `[` / `]` — practice playback speed, in percentage points. */
  onAdjustSpeed?: (deltaPercent: number) => void;
  /** `\` — back to 100 % playback speed. */
  onResetSpeed?: () => void;
}

/**
 * Alt-chords for fingering. Keyed by `event.code`, not `event.key`: on macOS
 * Alt+letter produces an accented character (Alt+P → π, Alt+A → å), so `key`
 * is useless here.
 */
const RIGHT_HAND_FINGER_CODES: Record<string, RightHandFinger> = {
  KeyP: 'p',
  KeyI: 'i',
  KeyM: 'm',
  KeyA: 'a',
  KeyC: 'c',
};

const FRET_TIMEOUT = 500; // ms to wait for second digit

export function useEditorKeyboard(options: UseEditorKeyboardOptions) {
  const {
    score,
    cursor,
    moveLeft,
    moveRight,
    moveUp,
    moveDown,
    moveToNextMeasure,
    moveToPrevMeasure,
    moveTo,
    onScoreChanged,
    onPlayPause,
    currentDuration,
    setCurrentDuration,
  } = options;

  const fretBufferRef = useRef<string>('');
  const fretTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardCellRef = useRef<ClipboardCell | null>(null);
  const clipboardBeatRef = useRef<ClipboardBeat | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const commitFret = useCallback((digits: string) => {
    const fret = parseInt(digits, 10);
    if (isNaN(fret) || fret < 0 || fret > 24) return;
    const s = optionsRef.current.score;
    if (!s) return;
    optionsRef.current.onBeforeMutation?.();
    const nextCursor = setNoteAndAdvance(
      s,
      optionsRef.current.cursor,
      fret,
      optionsRef.current.currentDuration,
    );
    optionsRef.current.onScoreChanged();
    if (nextCursor) {
      optionsRef.current.moveTo(nextCursor);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Text editing and modal controls own their keyboard events, including Space.
      if (e.isComposing || (e.target instanceof Element && e.target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"]',
      ))) return;

      const s = optionsRef.current.score;
      const c = optionsRef.current.cursor;
      // View mode: the score is read-only. Every branch below that would write
      // to it returns here instead; navigation and playback fall through.
      const readOnly = optionsRef.current.readOnly === true;

      // Practice chords — always available, in both modes.
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.code === 'KeyE') {
          e.preventDefault();
          optionsRef.current.onToggleMode?.();
          return;
        }
        if (e.code === 'KeyL') {
          e.preventDefault();
          optionsRef.current.onToggleLoop?.();
          return;
        }
        if (e.code === 'KeyB') {
          e.preventDefault();
          optionsRef.current.onToggleSidebar?.();
          return;
        }
      }

      // Playback speed — practice only, never written to the score.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === '[' || e.key === ']') {
          e.preventDefault();
          optionsRef.current.onAdjustSpeed?.(e.key === ']' ? 5 : -5);
          return;
        }
        if (e.key === '\\') {
          e.preventDefault();
          optionsRef.current.onResetSpeed?.();
          return;
        }
      }

      // Fingering — Alt chords, so they don't collide with the single-letter
      // effect keys (p is already hammer-on, m palm mute, a/i/c are free).
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const rightFinger = RIGHT_HAND_FINGER_CODES[e.code];
        if (rightFinger) {
          e.preventDefault();
          if (!readOnly) optionsRef.current.onRightHandFinger?.(rightFinger);
          return;
        }
        const leftMatch = /^Digit([1-4])$/.exec(e.code) ?? /^Numpad([1-4])$/.exec(e.code);
        if (leftMatch) {
          e.preventDefault();
          const finger = leftMatch[1] as LeftHandFinger;
          if (!readOnly && LEFT_HAND_FINGERS.includes(finger)) {
            optionsRef.current.onLeftHandFinger?.(finger);
          }
          return;
        }
        if (e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          if (!readOnly) optionsRef.current.onClearFingering?.();
          return;
        }
        if (e.code === 'KeyF') {
          e.preventDefault();
          optionsRef.current.onToggleFingering?.();
          return;
        }
        if (e.code === 'KeyS') {
          e.preventDefault();
          optionsRef.current.onToggleStrumming?.();
          return;
        }
      }

      // Undo / Redo — both rewrite the score.
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (readOnly) return;
        if (e.shiftKey) {
          optionsRef.current.onRedo?.();
        } else {
          optionsRef.current.onUndo?.();
        }
        return;
      }

      // Select all bars
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        optionsRef.current.onSelectAllBars?.();
        return;
      }

      // Helper: snapshot then re-render
      const mutate = () => {
        optionsRef.current.onBeforeMutation?.();
        optionsRef.current.onScoreChanged();
      };

      // Digit keys — fret number entry
      if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (readOnly) return;
        optionsRef.current.onClearBarSelection?.();
        if (fretTimerRef.current) {
          clearTimeout(fretTimerRef.current);
          fretTimerRef.current = null;
        }

        fretBufferRef.current += e.key;

        if (fretBufferRef.current.length >= 2) {
          // Two digits entered, commit immediately
          commitFret(fretBufferRef.current);
          fretBufferRef.current = '';
        } else {
          // Wait for potential second digit
          fretTimerRef.current = setTimeout(() => {
            commitFret(fretBufferRef.current);
            fretBufferRef.current = '';
            fretTimerRef.current = null;
          }, FRET_TIMEOUT);
        }
        return;
      }

      // Clear fret buffer on any non-digit key
      if (fretBufferRef.current) {
        if (fretTimerRef.current) {
          clearTimeout(fretTimerRef.current);
          fretTimerRef.current = null;
        }
        commitFret(fretBufferRef.current);
        fretBufferRef.current = '';
      }

      // Escape — clear bar selection
      if (e.key === 'Escape') {
        const barRange = optionsRef.current.selectedBarRange;
        if (barRange) {
          e.preventDefault();
          optionsRef.current.onClearBarSelection?.();
          return;
        }
      }

      // Navigation — clear bar selection on any movement key
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          optionsRef.current.onClearBarSelection?.();
          if (e.ctrlKey || e.metaKey) moveToPrevMeasure();
          else moveLeft();
          return;
        case 'ArrowRight':
          e.preventDefault();
          optionsRef.current.onClearBarSelection?.();
          if (e.ctrlKey || e.metaKey) {
            moveToNextMeasure();
          } else if (readOnly) {
            // View mode never grows the bar — just walk to the next beat.
            moveRight();
          } else if (s) {
            // Try to move right; if at last beat and bar has room, insert an empty beat
            const track = s.tracks[c.trackIndex];
            const staff = track?.staves[0];
            const bar = staff?.bars[c.barIndex];
            const voice = bar?.voices[c.voiceIndex];
            if (voice && c.beatIndex >= voice.beats.length - 1) {
              const newCursor = addBeatAfter(s, c, currentDuration);
              if (newCursor) {
                mutate();
                moveTo(newCursor);
              } else {
                // Bar is full or no room — move to next bar
                moveRight();
              }
            } else {
              moveRight();
            }
          } else {
            moveRight();
          }
          return;
        case 'ArrowUp':
          e.preventDefault();
          moveUp();
          return;
        case 'ArrowDown':
          e.preventDefault();
          moveDown();
          return;
        case 'u':
        case 'U':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            optionsRef.current.onScrollUp?.();
            return;
          }
          break;
        case 'd':
        case 'D':
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            optionsRef.current.onScrollDown?.();
            return;
          }
          break;
        case ' ':
          e.preventDefault();
          if (!e.repeat) onPlayPause();
          return;
      }

      // Delete/Backspace — clear selected bars, or remove note/empty beat
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (readOnly) return;
        const barRange = optionsRef.current.selectedBarRange;
        if (barRange) {
          optionsRef.current.onClearSelectedBars?.();
          return;
        }
        if (s) {
          const track = s.tracks[c.trackIndex];
          const staff = track?.staves[0];
          const bar = staff?.bars[c.barIndex];
          const voice = bar?.voices[c.voiceIndex];
          const beat = voice?.beats[c.beatIndex];

          if (beat && beat.isEmpty && beat.notes.length === 0) {
            // Beat is already empty — remove it from the bar
            const newCursor = removeBeat(s, c);
            if (newCursor) {
              mutate();
              moveTo(newCursor);
            }
          } else {
            // Remove the note on the current string
            removeNote(s, c);
            mutate();
          }
        }
        return;
      }

      // Duration shortcuts (Ctrl+1 through Ctrl+7)
      if ((e.ctrlKey || e.metaKey) && /^[1-7]$/.test(e.key)) {
        e.preventDefault();
        if (readOnly) return;
        const durationMap: Record<string, number> = {
          '1': Duration.Whole,
          '2': Duration.Half,
          '3': Duration.Quarter,
          '4': Duration.Eighth,
          '5': Duration.Sixteenth,
          '6': Duration.ThirtySecond,
          '7': Duration.SixtyFourth,
        };
        const dur = durationMap[e.key];
        if (dur !== undefined && s) {
          setBeatDuration(s, c, dur);
          setCurrentDuration(dur);
          mutate();
        }
        return;
      }

      // Chord finder (Cmd+K) — it inserts a chord, so edit mode only.
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (readOnly) return;
        optionsRef.current.onShowChordFinder?.();
        return;
      }

      // Clipboard operations — copy is harmless, cut and paste are not.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'v')) {
        // Only handle if not in an input field (already checked above)
        if (!s) return;
        if (readOnly && e.key !== 'c') {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const toast = optionsRef.current.onToast;

        if (e.key === 'c') {
          if (e.shiftKey) {
            // Shift+Cmd+C — copy entire beat
            const beat = copyBeat(s, c);
            if (beat) {
              clipboardBeatRef.current = beat;
              clipboardCellRef.current = null;
              const noteCount = beat.notes.length;
              toast?.(`Copied beat (${noteCount} note${noteCount !== 1 ? 's' : ''})`);
            } else {
              toast?.('Nothing to copy');
            }
          } else {
            // Cmd+C — copy single cell
            const cell = copyCell(s, c);
            if (cell) {
              clipboardCellRef.current = cell;
              clipboardBeatRef.current = null;
              toast?.(`Copied fret ${cell.fret}`);
            } else {
              toast?.('Nothing to copy');
            }
          }
          return;
        }

        if (e.key === 'x') {
          if (e.shiftKey) {
            // Shift+Cmd+X — cut entire beat
            const beat = cutBeat(s, c);
            if (beat) {
              clipboardBeatRef.current = beat;
              clipboardCellRef.current = null;
              const noteCount = beat.notes.length;
              toast?.(`Cut beat (${noteCount} note${noteCount !== 1 ? 's' : ''})`);
              mutate();
            } else {
              toast?.('Nothing to cut');
            }
          } else {
            // Cmd+X — cut single cell
            const cell = cutCell(s, c);
            if (cell) {
              clipboardCellRef.current = cell;
              clipboardBeatRef.current = null;
              toast?.(`Cut fret ${cell.fret}`);
              mutate();
            } else {
              toast?.('Nothing to cut');
            }
          }
          return;
        }

        if (e.key === 'v') {
          if (e.shiftKey && clipboardBeatRef.current) {
            // Shift+Cmd+V — paste entire beat
            pasteBeat(s, c, clipboardBeatRef.current);
            const noteCount = clipboardBeatRef.current.notes.length;
            toast?.(`Pasted beat (${noteCount} note${noteCount !== 1 ? 's' : ''})`);
            mutate();
          } else if (clipboardCellRef.current) {
            // Cmd+V — paste single cell
            pasteCell(s, c, clipboardCellRef.current);
            toast?.(`Pasted fret ${clipboardCellRef.current.fret}`);
            mutate();
          } else if (e.shiftKey) {
            toast?.('Nothing to paste (no beat copied)');
          } else {
            toast?.('Nothing to paste');
          }
          return;
        }
      }

      // Drum shortcuts — when on a drum track, single keys trigger drum hits
      if (optionsRef.current.isDrumTrack && !readOnly && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Enter places/toggles the drum on the current cursor lane (no auto-advance)
        if (e.key === 'Enter') {
          const lane = getDrumLane(c.stringNumber);
          if (lane) {
            e.preventDefault();
            optionsRef.current.onDrumHit?.(lane.midiNote);
            return;
          }
        }
        const drumMidi = DRUM_SHORTCUTS[e.key.toLowerCase()];
        if (drumMidi !== undefined) {
          e.preventDefault();
          optionsRef.current.onDrumHit?.(drumMidi);
          return;
        }
      }

      // Beat navigation: L = advance beat (insert if needed), J = prev beat
      if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        // Advancing inserts a rest when the bar has room, so it is an edit.
        if (!readOnly) optionsRef.current.onAdvanceBeat?.();
        return;
      }
      if ((e.key === 'j' || e.key === 'J') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        moveLeft();
        return;
      }

      // Rest insertion (R key)
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (s && !readOnly) {
          const nextCursor = insertRest(s, c, optionsRef.current.currentDuration);
          mutate();
          if (nextCursor) moveTo(nextCursor);
        }
        return;
      }

      // Accent (A key) — steps the whole beat through none → accent → heavy.
      // Beat-level on purpose: a strum is one gesture, not six decisions.
      if (e.key === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (s && !readOnly) {
          // Snapshot before the change so undo restores the un-accented beat.
          optionsRef.current.onBeforeMutation?.();
          const level = cycleBeatAccent(s, c);
          if (level === undefined) {
            optionsRef.current.onToast?.('No notes on this beat to accent');
          } else {
            optionsRef.current.onScoreChanged();
            optionsRef.current.onToast?.(
              level === null ? 'Accent removed' : level === 'heavy' ? 'Heavy accent' : 'Accent',
            );
          }
        }
        return;
      }

      // Help shortcut
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        optionsRef.current.onShowHelp?.();
        return;
      }

      // Effect shortcuts
      if (!readOnly && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const effectMap: Record<string, NoteEffect | 'slide' | 'bend' | 'dot' | 'addMeasure' | 'deleteMeasure' | 'addBeat'> = {
          h: 'hammerOn',
          p: 'hammerOn', // pull-off is same flag in alphaTab
          s: 'slide',
          b: 'bend',
          m: 'palmMute',
          v: 'vibrato',
          t: 'tap',
          g: 'ghostNote',
          '.': 'dot',
          '+': 'addMeasure',
          '-': 'deleteMeasure',
          'Insert': 'addBeat',
        };

        const action = effectMap[e.key.toLowerCase()] ?? effectMap[e.key];
        if (action && s) {
          e.preventDefault();
          switch (action) {
            case 'slide':
              toggleSlide(s, c);
              break;
            case 'bend':
              toggleBend(s, c);
              break;
            case 'dot':
              toggleDot(s, c);
              break;
            case 'addMeasure':
              insertMeasureAfter(s, c.barIndex);
              break;
            case 'deleteMeasure':
              deleteMeasure(s, c.barIndex);
              break;
            case 'addBeat': {
              const newCursor = addBeatAfter(s, c);
              if (newCursor) moveTo(newCursor);
              break;
            }
            default:
              toggleEffect(s, c, action);
              break;
          }
          mutate();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (fretTimerRef.current) {
        clearTimeout(fretTimerRef.current);
      }
    };
  }, [
    moveLeft,
    moveRight,
    moveUp,
    moveDown,
    moveToNextMeasure,
    moveToPrevMeasure,
    moveTo,
    onScoreChanged,
    onPlayPause,
    setCurrentDuration,
    commitFret,
  ]);
}
