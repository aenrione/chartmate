import {useState, useCallback, useRef} from 'react';
import type {AlphaTabApi} from '@coderline/alphatab';
import {model} from '@coderline/alphatab';

type Beat = InstanceType<typeof model.Beat>;
type Note = InstanceType<typeof model.Note>;
type Score = InstanceType<typeof model.Score>;

export interface EditorCursor {
  trackIndex: number;
  barIndex: number;
  voiceIndex: number;
  beatIndex: number;
  stringNumber: number; // 1-based (alphaTab: 1 = bottom line = lowest pitch, N = top line = highest pitch)
}

export interface CursorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_CURSOR: EditorCursor = {
  trackIndex: 0,
  barIndex: 0,
  voiceIndex: 0,
  beatIndex: 0,
  stringNumber: 1,
};

function getBeatAt(score: Score, cursor: EditorCursor): Beat | null {
  const track = score.tracks[cursor.trackIndex];
  if (!track) return null;
  const staff = track.staves[0];
  if (!staff) return null;
  const bar = staff.bars[cursor.barIndex];
  if (!bar) return null;
  const voice = bar.voices[cursor.voiceIndex];
  if (!voice) return null;
  return voice.beats[cursor.beatIndex] ?? null;
}

export function useEditorCursor(apiRef: React.RefObject<AlphaTabApi | null>) {
  const [cursor, setCursor] = useState<EditorCursor>(DEFAULT_CURSOR);
  const [cursorBounds, setCursorBounds] = useState<CursorBounds | null>(null);
  const scoreRef = useRef<Score | null>(null);

  const setScore = useCallback((score: Score) => {
    scoreRef.current = score;
  }, []);

  const updateCursorBounds = useCallback((newCursor?: EditorCursor) => {
    const c = newCursor ?? cursor;
    const api = apiRef.current;
    const score = scoreRef.current;
    if (!api || !score) {
      setCursorBounds(null);
      return;
    }

    const beat = getBeatAt(score, c);
    if (!beat) {
      setCursorBounds(null);
      return;
    }

    const lookup = api.boundsLookup;
    if (!lookup) {
      setCursorBounds(null);
      return;
    }

    const beatBounds = lookup.findBeat(beat);
    if (!beatBounds) {
      setCursorBounds(null);
      return;
    }

    setCursorBounds({
      x: beatBounds.visualBounds.x,
      y: beatBounds.visualBounds.y,
      width: beatBounds.visualBounds.w,
      height: beatBounds.visualBounds.h,
    });
  }, [cursor, apiRef]);

  const moveTo = useCallback((newCursor: EditorCursor) => {
    setCursor(newCursor);
    updateCursorBounds(newCursor);
  }, [updateCursorBounds]);

  const handleBeatClick = useCallback((beat: Beat) => {
    const score = scoreRef.current;
    if (!score) return;

    const voice = beat.voice;
    const bar = voice.bar;
    const staff = bar.staff;
    const track = staff.track;

    const trackIndex = score.tracks.indexOf(track);
    const barIndex = staff.bars.indexOf(bar);
    const voiceIndex = bar.voices.indexOf(voice);
    const beatIndex = voice.beats.indexOf(beat);

    const newCursor: EditorCursor = {
      trackIndex,
      barIndex,
      voiceIndex,
      beatIndex,
      stringNumber: cursor.stringNumber,
    };
    moveTo(newCursor);
  }, [cursor.stringNumber, moveTo]);

  const handleNoteClick = useCallback((note: Note) => {
    const beat = note.beat;
    const voice = beat.voice;
    const bar = voice.bar;
    const staff = bar.staff;
    const track = staff.track;
    const score = scoreRef.current;
    if (!score) return;

    const newCursor: EditorCursor = {
      trackIndex: score.tracks.indexOf(track),
      barIndex: staff.bars.indexOf(bar),
      voiceIndex: bar.voices.indexOf(voice),
      beatIndex: voice.beats.indexOf(beat),
      stringNumber: note.string,
    };
    moveTo(newCursor);
  }, [moveTo]);

  const moveLeft = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    const c = {...cursor};

    if (c.beatIndex > 0) {
      c.beatIndex--;
    } else if (c.barIndex > 0) {
      c.barIndex--;
      const staff = score.tracks[c.trackIndex]?.staves[0];
      const bar = staff?.bars[c.barIndex];
      const voice = bar?.voices[c.voiceIndex];
      c.beatIndex = voice ? voice.beats.length - 1 : 0;
    }
    moveTo(c);
  }, [cursor, moveTo]);

  const moveRight = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    const c = {...cursor};

    const staff = score.tracks[c.trackIndex]?.staves[0];
    const bar = staff?.bars[c.barIndex];
    const voice = bar?.voices[c.voiceIndex];
    if (!voice) return;

    if (c.beatIndex < voice.beats.length - 1) {
      c.beatIndex++;
    } else if (c.barIndex < (staff?.bars.length ?? 0) - 1) {
      c.barIndex++;
      c.beatIndex = 0;
    }
    moveTo(c);
  }, [cursor, moveTo]);

  const moveUp = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    const staff = score.tracks[cursor.trackIndex]?.staves[0];
    if (!staff) return;
    const stringCount = staff.stringTuning?.tunings?.length ?? 6;

    // In alphaTab, string N = top (highest pitch), string 1 = bottom (lowest pitch).
    // "Up" on screen = toward higher string number (higher pitch).
    if (cursor.stringNumber < stringCount) {
      moveTo({...cursor, stringNumber: cursor.stringNumber + 1});
    }
  }, [cursor, moveTo]);

  const moveDown = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    const staff = score.tracks[cursor.trackIndex]?.staves[0];
    if (!staff) return;

    // "Down" on screen = toward lower string number (lower pitch).
    if (cursor.stringNumber > 1) {
      moveTo({...cursor, stringNumber: cursor.stringNumber - 1});
    }
  }, [cursor, moveTo]);

  const moveToNextMeasure = useCallback(() => {
    const score = scoreRef.current;
    if (!score) return;
    const staff = score.tracks[cursor.trackIndex]?.staves[0];
    if (!staff) return;

    if (cursor.barIndex < staff.bars.length - 1) {
      moveTo({...cursor, barIndex: cursor.barIndex + 1, beatIndex: 0});
    }
  }, [cursor, moveTo]);

  const moveToPrevMeasure = useCallback(() => {
    if (cursor.barIndex > 0) {
      moveTo({...cursor, barIndex: cursor.barIndex - 1, beatIndex: 0});
    }
  }, [cursor, moveTo]);

  const getCurrentBeat = useCallback((): Beat | null => {
    const score = scoreRef.current;
    if (!score) return null;
    return getBeatAt(score, cursor);
  }, [cursor]);

  return {
    cursor,
    cursorBounds,
    setScore,
    moveTo,
    moveLeft,
    moveRight,
    moveUp,
    moveDown,
    moveToNextMeasure,
    moveToPrevMeasure,
    handleBeatClick,
    handleNoteClick,
    updateCursorBounds,
    getCurrentBeat,
  };
}
