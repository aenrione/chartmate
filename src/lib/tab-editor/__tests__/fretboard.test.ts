import {describe, it, expect} from 'vitest';
import {midiToNoteName, getStringFrets, buildFretboard, STANDARD_GUITAR_TUNING} from '../fretboard';

describe('fretboard', () => {
  describe('midiToNoteName', () => {
    it('converts MIDI 40 to E2', () => {
      const {name, octave} = midiToNoteName(40);
      expect(name).toBe('E');
      expect(octave).toBe(2);
    });

    it('converts MIDI 64 to E4', () => {
      const {name, octave} = midiToNoteName(64);
      expect(name).toBe('E');
      expect(octave).toBe(4);
    });

    it('converts MIDI 60 to C4 (middle C)', () => {
      const {name, octave} = midiToNoteName(60);
      expect(name).toBe('C');
      expect(octave).toBe(4);
    });

    it('converts MIDI 69 to A4 (concert pitch)', () => {
      const {name, octave} = midiToNoteName(69);
      expect(name).toBe('A');
      expect(octave).toBe(4);
    });

    it('handles sharps correctly', () => {
      const {name} = midiToNoteName(61); // C#4
      expect(name).toBe('C#');
    });
  });

  describe('getStringFrets', () => {
    it('generates correct number of frets', () => {
      const frets = getStringFrets(64, 0, 24);
      expect(frets.length).toBe(25); // 0 through 24
    });

    it('open string has fret 0', () => {
      const frets = getStringFrets(64, 0);
      expect(frets[0].fret).toBe(0);
      expect(frets[0].fullName).toBe('E4');
    });

    it('fret 12 is one octave up', () => {
      const frets = getStringFrets(64, 0); // E4
      expect(frets[12].fullName).toBe('E5');
      expect(frets[12].midiNote).toBe(76);
    });

    it('tracks string index', () => {
      const frets = getStringFrets(59, 1); // B3 string
      expect(frets[0].stringIndex).toBe(1);
    });

    it('first fret is one semitone up', () => {
      const frets = getStringFrets(64, 0); // E4
      expect(frets[1].fullName).toBe('F4');
    });
  });

  describe('buildFretboard', () => {
    it('builds fretboard for standard guitar', () => {
      const fretboard = buildFretboard(STANDARD_GUITAR_TUNING);
      expect(fretboard.length).toBe(6); // 6 strings

      // First string (highest E): open = E4
      expect(fretboard[0][0].fullName).toBe('E4');
      // Second string: open = B3
      expect(fretboard[1][0].fullName).toBe('B3');
      // Last string (lowest E): open = E2
      expect(fretboard[5][0].fullName).toBe('E2');
    });

    it('respects maxFret parameter', () => {
      const fretboard = buildFretboard(STANDARD_GUITAR_TUNING, 12);
      expect(fretboard[0].length).toBe(13); // 0 through 12
    });

    it('works with 4-string bass', () => {
      const bassTuning = [43, 38, 33, 28]; // G2 D2 A1 E1 (highest first)
      const fretboard = buildFretboard(bassTuning);
      expect(fretboard.length).toBe(4);
      expect(fretboard[0][0].fullName).toBe('G2');
      expect(fretboard[3][0].fullName).toBe('E1');
    });

    it('each fret increments MIDI by 1', () => {
      const fretboard = buildFretboard(STANDARD_GUITAR_TUNING, 5);
      for (const string of fretboard) {
        for (let i = 1; i < string.length; i++) {
          expect(string[i].midiNote).toBe(string[i - 1].midiNote + 1);
        }
      }
    });
  });
});
