import {describe, it, expect} from 'vitest';
import {model, importer, Settings} from '@coderline/alphatab';
import {createBlankScore} from '../newScore';
import {setNote, setNoteAndAdvance, setChord} from '../scoreOperations';
import {exportToGp7} from '../exporters';
import type {EditorCursor} from '../useEditorCursor';
import {
  planRightHandFingering,
  applyRightHandFingering,
  clearRightHandFingering,
  countFingeredNotes,
  setRightHandFinger,
  setLeftHandFinger,
  clearNoteFingering,
  getNoteFingering,
  alphaTabToRightHandFinger,
  alphaTabToLeftHandFinger,
  type RightHandFinger,
} from '../fingering';

const {Fingers} = model;

function cursorAt(overrides?: Partial<EditorCursor>): EditorCursor {
  return {trackIndex: 0, barIndex: 0, voiceIndex: 0, beatIndex: 0, stringNumber: 1, ...overrides};
}

/** Convenience: plan a sequence of single-note beats given alphaTab string numbers. */
function planSingles(strings: number[]): (RightHandFinger | null)[] {
  return planRightHandFingering(strings.map(s => ({strings: [s]}))).map(r => r[0]);
}

describe('planRightHandFingering — single notes', () => {
  it('gives the thumb the three bass strings', () => {
    // alphaTab string 1/2/3 are the physical 6th/5th/4th strings
    expect(planSingles([1, 2, 3])).toEqual(['p', 'p', 'p']);
  });

  it('gives i/m/a the three treble strings', () => {
    // alphaTab 4/5/6 are the physical 3rd/2nd/1st strings
    expect(planSingles([4, 5, 6])).toEqual(['i', 'm', 'a']);
  });

  it('lets the thumb repeat on consecutive bass notes', () => {
    expect(planSingles([1, 1, 2, 1])).toEqual(['p', 'p', 'p', 'p']);
  });

  it('alternates rather than repeating a pluck finger', () => {
    // repeated high E would be a,a,a,a — classical plays a-m-a-m
    expect(planSingles([6, 6, 6, 6])).toEqual(['a', 'm', 'a', 'm']);
    // repeated G string: i-m-i-m
    expect(planSingles([4, 4, 4])).toEqual(['i', 'm', 'i']);
  });

  it('does not alternate when the finger already changes', () => {
    expect(planSingles([4, 5, 4, 6])).toEqual(['i', 'm', 'i', 'a']);
  });

  it('a rest breaks the alternation chain', () => {
    const plan = planRightHandFingering([{strings: [6]}, {strings: []}, {strings: [6]}]);
    expect(plan[0]).toEqual(['a']);
    expect(plan[1]).toEqual([]);
    expect(plan[2]).toEqual(['a']);
  });

  it('handles a Giuliani p-i-m-a arpeggio formula', () => {
    // bass, then 3rd, 2nd, 1st string
    expect(planSingles([2, 4, 5, 6])).toEqual(['p', 'i', 'm', 'a']);
    // formula 2: p a m i
    expect(planSingles([2, 6, 5, 4])).toEqual(['p', 'a', 'm', 'i']);
  });
});

describe('planRightHandFingering — chords', () => {
  it('never repeats a finger inside a chord', () => {
    const [chord] = planRightHandFingering([{strings: [1, 4, 5, 6]}]);
    expect(chord).toEqual(['p', 'i', 'm', 'a']);
    expect(new Set(chord).size).toBe(chord.length);
  });

  it('keeps the thumb on the lowest note only and plucks the other basses', () => {
    // alphaTab 1,2,3 = physical 6,5,4 — only the 6th is the thumb's
    const [chord] = planRightHandFingering([{strings: [1, 2, 3]}]);
    expect(chord).toEqual(['p', 'i', 'm']);
  });

  it('assigns fingers in pitch order for a treble double stop', () => {
    expect(planRightHandFingering([{strings: [5, 6]}])[0]).toEqual(['m', 'a']);
    expect(planRightHandFingering([{strings: [4, 5]}])[0]).toEqual(['i', 'm']);
  });

  it('falls back to the thumb when more than four notes sound together', () => {
    const [chord] = planRightHandFingering([{strings: [1, 2, 3, 4, 5, 6]}]);
    expect(chord).toEqual(['p', 'p', 'p', 'i', 'm', 'a']);
  });

  it('preserves the input order of the strings in its output', () => {
    const [chord] = planRightHandFingering([{strings: [6, 1, 4]}]);
    expect(chord).toEqual(['a', 'p', 'i']);
  });

  it('respects a non-standard string count', () => {
    // 4-string bass: physical 1..4, so only string 1 (physical 4) is the thumb's
    const [chord] = planRightHandFingering([{strings: [1, 2, 3, 4]}], {stringCount: 4});
    expect(chord).toEqual(['p', 'i', 'm', 'a']);
  });
});

describe('applyRightHandFingering', () => {
  function arpeggioScore() {
    const score = createBlankScore({instrument: 'guitar', measureCount: 2});
    // bar 0: p i m a arpeggio on strings 2,4,5,6
    let cursor = cursorAt({stringNumber: 2});
    for (const s of [2, 4, 5, 6]) {
      const next = setNoteAndAdvance(score, {...cursor, stringNumber: s}, s === 2 ? 0 : 2, model.Duration.Quarter);
      cursor = next ?? cursor;
    }
    return score;
  }

  it('annotates a whole track and leaves the notes untouched', () => {
    const score = arpeggioScore();
    const before = exportToGp7(score);
    const changed = applyRightHandFingering(score, {trackIndex: 0});
    expect(changed).toBe(4);

    const beats = score.tracks[0].staves[0].bars[0].voices[0].beats;
    const fingers = beats.slice(0, 4).map(b => alphaTabToRightHandFinger(b.notes[0].rightHandFinger));
    expect(fingers).toEqual(['p', 'i', 'm', 'a']);
    // frets and strings are untouched
    expect(beats.slice(0, 4).map(b => [b.notes[0].string, b.notes[0].fret]))
      .toEqual([[2, 0], [4, 2], [5, 2], [6, 2]]);
    expect(before.length).toBeGreaterThan(0);
  });

  it('can be limited to a bar range', () => {
    const score = createBlankScore({instrument: 'guitar', measureCount: 2});
    setNote(score, cursorAt({barIndex: 0, stringNumber: 6}), 0);
    setNote(score, cursorAt({barIndex: 1, stringNumber: 6}), 0);
    applyRightHandFingering(score, {trackIndex: 0, startBar: 1, endBar: 1});
    const bar0 = score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0];
    const bar1 = score.tracks[0].staves[0].bars[1].voices[0].beats[0].notes[0];
    expect(bar0.rightHandFinger).toBe(Fingers.Unknown);
    expect(alphaTabToRightHandFinger(bar1.rightHandFinger)).toBe('a');
  });

  it('keeps existing fingering when overwrite is off', () => {
    const score = arpeggioScore();
    const note = score.tracks[0].staves[0].bars[0].voices[0].beats[1].notes[0];
    note.rightHandFinger = Fingers.Thumb;
    applyRightHandFingering(score, {trackIndex: 0, overwrite: false});
    expect(alphaTabToRightHandFinger(note.rightHandFinger)).toBe('p');
  });

  it('does not touch left-hand fingering', () => {
    const score = arpeggioScore();
    const note = score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0];
    note.leftHandFinger = Fingers.MiddleFinger;
    applyRightHandFingering(score, {trackIndex: 0});
    expect(alphaTabToLeftHandFinger(note.leftHandFinger)).toBe('2');
  });

  it('clears again and counts what is fingered', () => {
    const score = arpeggioScore();
    applyRightHandFingering(score, {trackIndex: 0});
    expect(countFingeredNotes(score, 0)).toBe(4);
    expect(clearRightHandFingering(score, {trackIndex: 0})).toBe(4);
    expect(countFingeredNotes(score, 0)).toBe(0);
  });

  it('skips percussion tracks', () => {
    const score = createBlankScore({instrument: 'drums'});
    expect(applyRightHandFingering(score, {trackIndex: 0})).toBe(0);
  });

  it('carries the alternation across a bar line', () => {
    const score = createBlankScore({instrument: 'guitar', measureCount: 2});
    setNote(score, cursorAt({barIndex: 0, stringNumber: 6}), 0);
    setNote(score, cursorAt({barIndex: 1, stringNumber: 6}), 0);
    applyRightHandFingering(score, {trackIndex: 0});
    const first = score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0];
    const second = score.tracks[0].staves[0].bars[1].voices[0].beats[0].notes[0];
    expect(alphaTabToRightHandFinger(first.rightHandFinger)).toBe('a');
    expect(alphaTabToRightHandFinger(second.rightHandFinger)).toBe('m');
  });

  it('handles a strummed chord beat', () => {
    const score = createBlankScore({instrument: 'guitar'});
    setChord(score, cursorAt(), [
      {stringNumber: 1, fret: 3}, {stringNumber: 4, fret: 0},
      {stringNumber: 5, fret: 1}, {stringNumber: 6, fret: 3},
    ]);
    applyRightHandFingering(score, {trackIndex: 0});
    const notes = score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes;
    const byString = new Map(notes.map(n => [n.string, alphaTabToRightHandFinger(n.rightHandFinger)]));
    expect(byString.get(1)).toBe('p');
    expect(byString.get(4)).toBe('i');
    expect(byString.get(5)).toBe('m');
    expect(byString.get(6)).toBe('a');
  });
});

describe('per-note fingering edits', () => {
  it('sets, reads and toggles the right hand finger', () => {
    const score = createBlankScore({instrument: 'guitar'});
    const cursor = cursorAt({stringNumber: 4});
    setNote(score, cursor, 2);
    expect(setRightHandFinger(score, cursor, 'm')).toBe(true);
    expect(getNoteFingering(score, cursor)).toEqual({left: null, right: 'm'});
    // same finger again clears it
    setRightHandFinger(score, cursor, 'm');
    expect(getNoteFingering(score, cursor)).toEqual({left: null, right: null});
  });

  it('sets and clears the left hand finger independently', () => {
    const score = createBlankScore({instrument: 'guitar'});
    const cursor = cursorAt({stringNumber: 4});
    setNote(score, cursor, 2);
    setLeftHandFinger(score, cursor, '3');
    setRightHandFinger(score, cursor, 'i');
    expect(getNoteFingering(score, cursor)).toEqual({left: '3', right: 'i'});
    setLeftHandFinger(score, cursor, null);
    expect(getNoteFingering(score, cursor)).toEqual({left: null, right: 'i'});
    clearNoteFingering(score, cursor);
    expect(getNoteFingering(score, cursor)).toEqual({left: null, right: null});
  });

  it('does nothing when there is no note under the cursor', () => {
    const score = createBlankScore({instrument: 'guitar'});
    const cursor = cursorAt({stringNumber: 4});
    expect(setRightHandFinger(score, cursor, 'i')).toBe(false);
    expect(getNoteFingering(score, cursor)).toBeNull();
  });
});

describe('guitar pro 7 round-trip', () => {
  it('preserves both hands through export and re-import', () => {
    const score = createBlankScore({instrument: 'guitar'});
    const cursor = cursorAt({stringNumber: 4});
    setNote(score, cursor, 3);
    setLeftHandFinger(score, cursor, '2');
    setRightHandFinger(score, cursor, 'p');

    const bytes = exportToGp7(score);
    const reloaded = importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
    const note = reloaded.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0];

    expect(note.fret).toBe(3);
    expect(note.string).toBe(4);
    expect(alphaTabToLeftHandFinger(note.leftHandFinger)).toBe('2');
    expect(alphaTabToRightHandFinger(note.rightHandFinger)).toBe('p');
  });
});
