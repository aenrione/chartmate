import {describe, it, expect} from 'vitest';
import {noteTypes, noteFlags} from '@eliwhite/scan-chart';
import {
  DRUM_PIECES,
  DROPPED_GM,
  GM_TO_PIECE,
  PIECE_TO_GM,
  PIECE_TO_LANE,
  PIECE_TO_ROLE,
  laneToPiece,
  pieceFromChartNote,
  pieceFromGm,
  type DrumPiece,
} from '../pieces';

describe('drum piece vocabulary', () => {
  it('covers the whole GM percussion range with no overlap and no gaps', () => {
    const unclassified: number[] = [];
    const both: number[] = [];
    for (let midi = 35; midi <= 81; midi++) {
      const mapped = midi in GM_TO_PIECE;
      const dropped = DROPPED_GM.has(midi);
      if (!mapped && !dropped) unclassified.push(midi);
      if (mapped && dropped) both.push(midi);
    }
    expect(unclassified).toEqual([]);
    expect(both).toEqual([]);
  });

  it('round-trips every piece through its canonical GM note', () => {
    for (const piece of DRUM_PIECES) {
      expect(pieceFromGm(PIECE_TO_GM[piece])).toBe(piece);
    }
  });

  it('round-trips every piece through its chart lane', () => {
    for (const piece of DRUM_PIECES) {
      const {lane, cymbal} = PIECE_TO_LANE[piece];
      expect(laneToPiece(lane, cymbal)).toBe(piece);
    }
  });

  it('assigns a distinct lane+flag to each piece', () => {
    const seen = new Set(
      DRUM_PIECES.map(p => `${PIECE_TO_LANE[p].lane}:${PIECE_TO_LANE[p].cymbal}`),
    );
    expect(seen.size).toBe(DRUM_PIECES.length);
  });

  it('gives every piece a role', () => {
    for (const piece of DRUM_PIECES) {
      expect(PIECE_TO_ROLE[piece]).toBeTruthy();
    }
  });

  it('drops percussion that has no lane', () => {
    expect(pieceFromGm(60)).toBeNull(); // high bongo
    expect(pieceFromGm(81)).toBeNull(); // open triangle
  });

  it('folds the documented exceptions instead of dropping them', () => {
    expect(pieceFromGm(37)).toBe('snare');     // side stick
    expect(pieceFromGm(44)).toBe('hihat');     // pedal hi-hat
    expect(pieceFromGm(46)).toBe('hihat');     // open hi-hat
    expect(pieceFromGm(52)).toBe('crash');     // china
    expect(pieceFromGm(53)).toBe('ride');      // ride bell
    expect(pieceFromGm(59)).toBe('ride');      // ride cymbal 2
    expect(pieceFromGm(56)).toBe('high-tom');  // cowbell
    expect(pieceFromGm(75)).toBe('high-tom');  // claves
  });
});

describe('pieceFromChartNote', () => {
  const ev = (type: number, flags = 0) => ({type, flags}) as never;

  it('reads lane 2/3/4 by the cymbal flag, in both directions', () => {
    const cases: [number, number, DrumPiece][] = [
      [noteTypes.kick, 0, 'kick'],
      [noteTypes.redDrum, 0, 'snare'],
      [noteTypes.yellowDrum, noteFlags.tom, 'high-tom'],
      [noteTypes.yellowDrum, noteFlags.cymbal, 'hihat'],
      [noteTypes.blueDrum, noteFlags.tom, 'mid-tom'],
      [noteTypes.blueDrum, noteFlags.cymbal, 'ride'],
      [noteTypes.greenDrum, noteFlags.tom, 'floor-tom'],
      [noteTypes.greenDrum, noteFlags.cymbal, 'crash'],
    ];
    for (const [type, flags, expected] of cases) {
      expect(pieceFromChartNote(ev(type, flags))).toBe(expected);
    }
  });

  it('treats an unflagged lane as a tom, matching how .chart is read', () => {
    expect(pieceFromChartNote(ev(noteTypes.yellowDrum, 0))).toBe('high-tom');
    expect(pieceFromChartNote(ev(noteTypes.blueDrum, 0))).toBe('mid-tom');
    expect(pieceFromChartNote(ev(noteTypes.greenDrum, 0))).toBe('floor-tom');
  });

  it('returns null for a non-drum note type', () => {
    expect(pieceFromChartNote(ev(noteTypes.green, 0))).toBeNull();
  });
});
