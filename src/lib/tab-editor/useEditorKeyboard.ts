import {useEffect, useRef, useCallback} from 'react';
import {model} from '@coderline/alphatab';
import type {EditorCursor} from './useEditorCursor';
import {DRUM_SHORTCUTS} from './drumMap';
import {
  setNoteAndAdvance,
  removeNote,
  insertRest,
  setBeatDuration,
  toggleDot,
  toggleEffect,
  toggleSlide,
  toggleBend,
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
}

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
      // Don't capture if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const s = optionsRef.current.score;
      const c = optionsRef.current.cursor;

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          optionsRef.current.onRedo?.();
        } else {
          optionsRef.current.onUndo?.();
        }
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

      // Navigation
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) moveToPrevMeasure();
          else moveLeft();
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            moveToNextMeasure();
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
        case ' ':
          e.preventDefault();
          onPlayPause();
          return;
      }

      // Delete/Backspace — remove note, or remove empty beat from bar
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
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

      // Chord finder (Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        optionsRef.current.onShowChordFinder?.();
        return;
      }

      // Clipboard operations
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x' || e.key === 'v')) {
        // Only handle if not in an input field (already checked above)
        if (!s) return;
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
      if (optionsRef.current.isDrumTrack && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
        optionsRef.current.onAdvanceBeat?.();
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
        if (s) {
          const nextCursor = insertRest(s, c, optionsRef.current.currentDuration);
          mutate();
          if (nextCursor) moveTo(nextCursor);
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
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
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

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
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
