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
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const commitFret = useCallback((digits: string) => {
    const fret = parseInt(digits, 10);
    if (isNaN(fret) || fret < 0 || fret > 24) return;
    const s = optionsRef.current.score;
    if (!s) return;
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
          if (e.ctrlKey || e.metaKey) moveToNextMeasure();
          else moveRight();
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

      // Delete/Backspace — remove note
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (s) {
          removeNote(s, c);
          onScoreChanged();
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
          onScoreChanged();
        }
        return;
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
          onScoreChanged();
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
          onScoreChanged();
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
