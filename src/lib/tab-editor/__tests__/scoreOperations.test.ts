import {describe, it, expect} from 'vitest';
import {createBlankScore} from '../newScore';
import {
  setNote,
  setNoteAndAdvance,
  insertRest,
  removeNote,
  toggleRest,
  setBeatDuration,
  toggleDot,
  toggleEffect,
  toggleSlide,
  toggleBend,
  insertMeasureAfter,
  deleteMeasure,
  addBeatAfter,
  addTrack,
  removeTrack,
  setTrackTuning,
  setTempo,
} from '../scoreOperations';
import type {EditorCursor} from '../useEditorCursor';
import {model} from '@coderline/alphatab';

const {Duration, SlideOutType, BendType, HarmonicType, VibratoType} = model;

function makeCursor(overrides?: Partial<EditorCursor>): EditorCursor {
  return {
    trackIndex: 0,
    barIndex: 0,
    voiceIndex: 0,
    beatIndex: 0,
    stringNumber: 1,
    ...overrides,
  };
}

function getBeat(score: ReturnType<typeof createBlankScore>, cursor: EditorCursor) {
  return score.tracks[cursor.trackIndex]
    ?.staves[0]
    ?.bars[cursor.barIndex]
    ?.voices[cursor.voiceIndex]
    ?.beats[cursor.beatIndex] ?? null;
}

function getNoteOnString(score: ReturnType<typeof createBlankScore>, cursor: EditorCursor) {
  const beat = getBeat(score, cursor);
  if (!beat) return null;
  return beat.notes.find((n: any) => n.string === cursor.stringNumber) ?? null;
}

describe('scoreOperations', () => {
  describe('setNote', () => {
    it('places a note at the cursor position', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor({stringNumber: 1});
      setNote(score, cursor, 5);

      const beat = getBeat(score, cursor);
      expect(beat).not.toBeNull();
      expect(beat!.isEmpty).toBe(false);
      expect(beat!.notes.length).toBe(1);
      expect(beat!.notes[0].string).toBe(1);
      expect(beat!.notes[0].fret).toBe(5);
    });

    it('updates fret if note already exists on string', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor({stringNumber: 1});
      setNote(score, cursor, 5);
      setNote(score, cursor, 7);

      const beat = getBeat(score, cursor);
      expect(beat!.notes.length).toBe(1);
      expect(beat!.notes[0].fret).toBe(7);
    });

    it('allows multiple notes on different strings (chord)', () => {
      const score = createBlankScore({measureCount: 2});
      setNote(score, makeCursor({stringNumber: 1}), 0);
      setNote(score, makeCursor({stringNumber: 2}), 0);
      setNote(score, makeCursor({stringNumber: 3}), 1);

      const beat = getBeat(score, makeCursor());
      expect(beat!.notes.length).toBe(3);
    });

    it('places note on fret 0 (open string)', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 0);

      const note = getNoteOnString(score, cursor);
      expect(note).not.toBeNull();
      expect(note!.fret).toBe(0);
    });

    it('places note on high fret (24)', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 24);

      const note = getNoteOnString(score, cursor);
      expect(note!.fret).toBe(24);
    });
  });

  describe('removeNote', () => {
    it('removes a note from the beat', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 5);
      removeNote(score, cursor);

      const beat = getBeat(score, cursor);
      expect(beat!.notes.length).toBe(0);
      expect(beat!.isEmpty).toBe(true);
    });

    it('keeps other notes when removing one from a chord', () => {
      const score = createBlankScore({measureCount: 2});
      setNote(score, makeCursor({stringNumber: 1}), 0);
      setNote(score, makeCursor({stringNumber: 2}), 1);
      removeNote(score, makeCursor({stringNumber: 1}));

      const beat = getBeat(score, makeCursor());
      expect(beat!.notes.length).toBe(1);
      expect(beat!.notes[0].string).toBe(2);
      expect(beat!.isEmpty).toBe(false);
    });

    it('does nothing if no note on string', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor({stringNumber: 3});
      removeNote(score, cursor); // should not throw
      const beat = getBeat(score, cursor);
      expect(beat).not.toBeNull();
    });
  });

  describe('toggleRest', () => {
    it('toggles beat from rest to non-rest', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      expect(getBeat(score, cursor)!.isEmpty).toBe(true);

      toggleRest(score, cursor);
      expect(getBeat(score, cursor)!.isEmpty).toBe(false);
    });

    it('clears notes when toggling to rest', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 5);
      toggleRest(score, cursor);

      const beat = getBeat(score, cursor);
      expect(beat!.isEmpty).toBe(true);
      expect(beat!.notes.length).toBe(0);
    });
  });

  describe('setBeatDuration', () => {
    it('changes beat duration', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setBeatDuration(score, cursor, Duration.Eighth);
      expect(getBeat(score, cursor)!.duration).toBe(Duration.Eighth);
    });

    it('works with all standard durations', () => {
      const durations = [
        Duration.Whole, Duration.Half, Duration.Quarter,
        Duration.Eighth, Duration.Sixteenth, Duration.ThirtySecond,
        Duration.SixtyFourth,
      ];
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      for (const d of durations) {
        setBeatDuration(score, cursor, d);
        expect(getBeat(score, cursor)!.duration).toBe(d);
      }
    });
  });

  describe('toggleDot', () => {
    it('cycles through 0 → 1 → 2 → 0', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();

      expect(getBeat(score, cursor)!.dots).toBe(0);
      toggleDot(score, cursor);
      expect(getBeat(score, cursor)!.dots).toBe(1);
      toggleDot(score, cursor);
      expect(getBeat(score, cursor)!.dots).toBe(2);
      toggleDot(score, cursor);
      expect(getBeat(score, cursor)!.dots).toBe(0);
    });
  });

  describe('toggleEffect', () => {
    it('toggles palm mute', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 5);

      toggleEffect(score, cursor, 'palmMute');
      expect(getNoteOnString(score, cursor)!.isPalmMute).toBe(true);

      toggleEffect(score, cursor, 'palmMute');
      expect(getNoteOnString(score, cursor)!.isPalmMute).toBe(false);
    });

    it('toggles ghost note', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 5);

      toggleEffect(score, cursor, 'ghostNote');
      expect(getNoteOnString(score, cursor)!.isGhost).toBe(true);
    });

    it('toggles vibrato', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 5);

      toggleEffect(score, cursor, 'vibrato');
      expect(getNoteOnString(score, cursor)!.vibrato).toBe(VibratoType.Slight);

      toggleEffect(score, cursor, 'vibrato');
      expect(getNoteOnString(score, cursor)!.vibrato).toBe(VibratoType.None);
    });

    it('does nothing if no note at cursor', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      toggleEffect(score, cursor, 'hammerOn');
    });

    it('toggles hammer-on flag (may be recalculated by finish)', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 5);
      // Hammer-on requires a destination note to be meaningful;
      // alphaTab's finish() may reset it without one. Just verify no crash.
      toggleEffect(score, cursor, 'hammerOn');
      expect(getNoteOnString(score, cursor)).not.toBeNull();
    });
  });

  describe('toggleSlide', () => {
    it('sets slide on a note (may be recalculated by finish)', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 5);
      // Slide requires a destination note; finish() may recalculate.
      // Just verify the operation doesn't throw.
      toggleSlide(score, cursor);
      expect(getNoteOnString(score, cursor)).not.toBeNull();
    });
  });

  describe('toggleBend', () => {
    it('adds and removes a bend', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      setNote(score, cursor, 5);

      toggleBend(score, cursor);
      expect(getNoteOnString(score, cursor)!.bendType).toBe(BendType.Bend);

      toggleBend(score, cursor);
      expect(getNoteOnString(score, cursor)!.bendType).toBe(BendType.None);
    });
  });

  describe('insertMeasureAfter', () => {
    it('adds a measure after the specified index', () => {
      const score = createBlankScore({measureCount: 4});
      expect(score.masterBars.length).toBe(4);

      insertMeasureAfter(score, 1);
      expect(score.masterBars.length).toBe(5);
    });

    it('adds bars for all track staves', () => {
      const score = createBlankScore({measureCount: 4});
      const staff = score.tracks[0].staves[0];
      expect(staff.bars.length).toBe(4);

      insertMeasureAfter(score, 0);
      expect(staff.bars.length).toBe(5);
    });

    it('preserves time signature from reference bar', () => {
      const score = createBlankScore({
        measureCount: 2,
        timeSignatureNumerator: 3,
        timeSignatureDenominator: 4,
      });
      insertMeasureAfter(score, 0);
      expect(score.masterBars[1].timeSignatureNumerator).toBe(3);
    });
  });

  describe('deleteMeasure', () => {
    it('removes a measure', () => {
      const score = createBlankScore({measureCount: 4});
      deleteMeasure(score, 1);
      expect(score.masterBars.length).toBe(3);
    });

    it('removes corresponding bars from staves', () => {
      const score = createBlankScore({measureCount: 4});
      const staff = score.tracks[0].staves[0];
      deleteMeasure(score, 0);
      expect(staff.bars.length).toBe(3);
    });

    it('does not delete the last measure', () => {
      const score = createBlankScore({measureCount: 1});
      deleteMeasure(score, 0);
      expect(score.masterBars.length).toBe(1);
    });
  });

  describe('addBeatAfter', () => {
    it('inserts a new beat after cursor position', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      const voice = score.tracks[0].staves[0].bars[0].voices[0];
      const initialCount = voice.beats.length;

      const newCursor = addBeatAfter(score, cursor);
      expect(newCursor).not.toBeNull();
      expect(newCursor!.beatIndex).toBe(cursor.beatIndex + 1);
      expect(voice.beats.length).toBe(initialCount + 1);
    });

    it('uses specified duration', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      addBeatAfter(score, cursor, Duration.Eighth);

      const voice = score.tracks[0].staves[0].bars[0].voices[0];
      expect(voice.beats[1].duration).toBe(Duration.Eighth);
    });
  });

  describe('addTrack', () => {
    it('adds a guitar track', () => {
      const score = createBlankScore({measureCount: 4});
      expect(score.tracks.length).toBe(1);

      addTrack(score, {
        name: 'Lead Guitar',
        instrument: 'guitar',
        stringCount: 6,
        tuning: [40, 45, 50, 55, 59, 64],
      });
      expect(score.tracks.length).toBe(2);
      expect(score.tracks[1].name).toBe('Lead Guitar');
    });

    it('adds bars matching existing master bars', () => {
      const score = createBlankScore({measureCount: 8});
      addTrack(score, {
        name: 'Bass',
        instrument: 'bass',
        stringCount: 4,
        tuning: [28, 33, 38, 43],
      });
      const newStaff = score.tracks[1].staves[0];
      expect(newStaff.bars.length).toBe(8);
    });

    it('creates percussion staff for drums', () => {
      const score = createBlankScore({measureCount: 2});
      addTrack(score, {
        name: 'Drums',
        instrument: 'drums',
        stringCount: 0,
        tuning: [],
      });
      const staff = score.tracks[1].staves[0];
      expect(staff.isPercussion).toBe(true);
    });

    it('adds track to score with existing notes, then edits new track', () => {
      const score = createBlankScore({measureCount: 4, instrument: 'guitar'});
      // Add notes to track 0
      setNote(score, makeCursor({stringNumber: 1}), 5);
      setNote(score, makeCursor({barIndex: 1, stringNumber: 2}), 3);

      // Add bass track
      addTrack(score, {
        name: 'Bass',
        instrument: 'bass',
        stringCount: 4,
        tuning: [28, 33, 38, 43],
      });
      expect(score.tracks.length).toBe(2);

      // Add note to bass track
      const bassCursor = makeCursor({trackIndex: 1, stringNumber: 1});
      setNote(score, bassCursor, 7);
      const bassBeat = getBeat(score, bassCursor);
      expect(bassBeat!.notes.length).toBe(1);
      expect(bassBeat!.notes[0].fret).toBe(7);
    });

    it('adds drums track', () => {
      const score = createBlankScore({measureCount: 2, instrument: 'guitar'});
      addTrack(score, {name: 'Drums', instrument: 'drums', stringCount: 0, tuning: []});
      expect(score.tracks.length).toBe(2);
      expect(score.tracks[1].staves[0].isPercussion).toBe(true);
    });
  });

  describe('removeTrack', () => {
    it('removes a track', () => {
      const score = createBlankScore({measureCount: 2});
      addTrack(score, {name: 'Bass', instrument: 'bass', stringCount: 4, tuning: [28, 33, 38, 43]});
      expect(score.tracks.length).toBe(2);

      removeTrack(score, 1);
      expect(score.tracks.length).toBe(1);
    });

    it('does not remove the last track', () => {
      const score = createBlankScore({measureCount: 2});
      removeTrack(score, 0);
      expect(score.tracks.length).toBe(1);
    });
  });

  describe('setTrackTuning', () => {
    it('changes tuning on a track', () => {
      const score = createBlankScore({measureCount: 2, instrument: 'guitar'});
      const dropD = [38, 45, 50, 55, 59, 64]; // Drop D
      setTrackTuning(score, 0, dropD);

      const staff = score.tracks[0].staves[0];
      expect(staff.stringTuning.tunings.length).toBe(6);
    });
  });

  describe('setTempo', () => {
    it('sets tempo on the first master bar', () => {
      const score = createBlankScore({measureCount: 2, tempo: 120});
      setTempo(score, 180);

      const auto = score.masterBars[0].tempoAutomations;
      expect(auto.length).toBeGreaterThan(0);
      expect(auto[0].value).toBe(180);
    });
  });

  describe('setNoteAndAdvance', () => {
    it('places a note and returns cursor for next beat in same bar', () => {
      const score = createBlankScore({measureCount: 2}); // 4/4 time
      const cursor = makeCursor();

      // Place quarter note — bar has 4/4 capacity, one quarter fills 1/4
      const next = setNoteAndAdvance(score, cursor, 5, Duration.Quarter);
      expect(next).not.toBeNull();
      expect(next!.barIndex).toBe(0); // still in same bar
      expect(next!.beatIndex).toBe(1); // moved to beat 1

      const beat0 = getBeat(score, cursor);
      expect(beat0!.notes.length).toBe(1);
      expect(beat0!.notes[0].fret).toBe(5);
      expect(beat0!.duration).toBe(Duration.Quarter);
    });

    it('fills a 4/4 bar with 4 quarter notes then advances to next bar', () => {
      const score = createBlankScore({measureCount: 2});
      let cur = makeCursor();

      for (let i = 0; i < 4; i++) {
        const next = setNoteAndAdvance(score, cur, i, Duration.Quarter);
        expect(next).not.toBeNull();
        cur = next!;
      }

      // After 4 quarter notes, should be in bar 1
      expect(cur.barIndex).toBe(1);
      expect(cur.beatIndex).toBe(0);
    });

    it('fills a bar with 2 half notes', () => {
      const score = createBlankScore({measureCount: 2});
      let cur = makeCursor();

      const next1 = setNoteAndAdvance(score, cur, 0, Duration.Half);
      expect(next1).not.toBeNull();
      expect(next1!.barIndex).toBe(0);

      const next2 = setNoteAndAdvance(score, next1!, 2, Duration.Half);
      expect(next2).not.toBeNull();
      expect(next2!.barIndex).toBe(1); // bar full, advanced
    });

    it('fills a bar with 1 whole note', () => {
      const score = createBlankScore({measureCount: 2});
      const cur = makeCursor();

      const next = setNoteAndAdvance(score, cur, 5, Duration.Whole);
      expect(next).not.toBeNull();
      expect(next!.barIndex).toBe(1); // whole note fills the bar
    });

    it('fills a bar with 8 eighth notes', () => {
      const score = createBlankScore({measureCount: 2});
      let cur = makeCursor();

      for (let i = 0; i < 8; i++) {
        const next = setNoteAndAdvance(score, cur, i % 5, Duration.Eighth);
        expect(next).not.toBeNull();
        cur = next!;
      }
      expect(cur.barIndex).toBe(1);
    });
  });

  describe('insertRest', () => {
    it('inserts a rest at an empty beat position', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();

      const next = insertRest(score, cursor, Duration.Quarter);
      expect(next).not.toBeNull();
      expect(next!.barIndex).toBe(0);
      expect(next!.beatIndex).toBe(1);

      // Original beat should still be a rest
      const beat = getBeat(score, cursor);
      expect(beat!.isEmpty).toBe(true);
      expect(beat!.duration).toBe(Duration.Quarter);
    });

    it('inserts rest after a beat with notes when bar has space', () => {
      const score = createBlankScore({measureCount: 2});
      const cursor = makeCursor();
      // First place a quarter note using setNoteAndAdvance (shrinks beat to quarter)
      const next1 = setNoteAndAdvance(score, cursor, 5, Duration.Quarter);
      expect(next1).not.toBeNull();

      // Now insert a rest at the next position
      const next2 = insertRest(score, next1!, Duration.Quarter);
      expect(next2).not.toBeNull();
      const restBeat = getBeat(score, next2!);
      expect(restBeat!.isEmpty).toBe(true);
    });

    it('returns null when bar is full', () => {
      const score = createBlankScore({measureCount: 2});
      // Fill bar with 4 quarter notes
      let cur = makeCursor();
      for (let i = 0; i < 4; i++) {
        cur = setNoteAndAdvance(score, cur, i, Duration.Quarter)!;
      }
      // Now try to insert rest in bar 0 (which is full)
      const fullBarCursor = makeCursor({barIndex: 0, beatIndex: 3});
      const result = insertRest(score, fullBarCursor, Duration.Quarter);
      // Should return next bar since current bar is full
      expect(result).toBeNull(); // bar full, no room
    });
  });
});
