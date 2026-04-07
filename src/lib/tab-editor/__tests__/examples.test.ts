import {describe, it, expect} from 'vitest';
import {createGuitarDemo} from '../examples/guitar-demo';
import {createDrumsDemo} from '../examples/drums-demo';
import {createBassDemo} from '../examples/bass-demo';
import {exportToGp7, exportToAlphaTex} from '../exporters';

describe('example tabs', () => {
  describe('guitar demo', () => {
    it('creates a valid score', () => {
      const score = createGuitarDemo();
      expect(score.title).toBe('Smoke on the Water');
      expect(score.tracks.length).toBe(1);
      expect(score.masterBars.length).toBe(8);
    });

    it('uses overdriven guitar MIDI program (29)', () => {
      const score = createGuitarDemo();
      expect(score.tracks[0].playbackInfo.program).toBe(29);
      expect(score.tracks[0].playbackInfo.primaryChannel).toBe(0);
    });

    it('has notes in the first 4 bars', () => {
      const score = createGuitarDemo();
      const staff = score.tracks[0].staves[0];

      for (let bar = 0; bar < 4; bar++) {
        const voice = staff.bars[bar].voices[0];
        const hasNotes = voice.beats.some((b: any) => !b.isEmpty && b.notes.length > 0);
        expect(hasNotes).toBe(true);
      }
    });

    it('bar 1 has power chords (multiple notes per beat)', () => {
      const score = createGuitarDemo();
      const voice = score.tracks[0].staves[0].bars[0].voices[0];
      const chordBeat = voice.beats[0];
      expect(chordBeat.notes.length).toBeGreaterThanOrEqual(2);
    });

    it('bar 2 has rests (syncopation)', () => {
      const score = createGuitarDemo();
      const voice = score.tracks[0].staves[0].bars[1].voices[0];
      const hasRest = voice.beats.some((b: any) => b.isEmpty);
      expect(hasRest).toBe(true);
    });

    it('exports to GP7', () => {
      const score = createGuitarDemo();
      const gp7 = exportToGp7(score);
      expect(gp7.length).toBeGreaterThan(0);
    });

    it('exports to AlphaTex', () => {
      const score = createGuitarDemo();
      const tex = exportToAlphaTex(score);
      expect(tex.length).toBeGreaterThan(0);
    });
  });

  describe('drums demo', () => {
    it('creates a valid percussion score', () => {
      const score = createDrumsDemo();
      expect(score.title).toBe('Basic Rock Beat');
      expect(score.tracks.length).toBe(1);
      expect(score.tracks[0].staves[0].isPercussion).toBe(true);
      expect(score.masterBars.length).toBe(8);
    });

    it('uses drum channel 9 with program 0', () => {
      const score = createDrumsDemo();
      expect(score.tracks[0].playbackInfo.program).toBe(0);
      expect(score.tracks[0].playbackInfo.primaryChannel).toBe(9);
    });

    it('all 8 bars have beats', () => {
      const score = createDrumsDemo();
      const staff = score.tracks[0].staves[0];

      for (let bar = 0; bar < 8; bar++) {
        const voice = staff.bars[bar].voices[0];
        expect(voice.beats.length).toBeGreaterThan(0);
        const hasNotes = voice.beats.some((b: any) => b.notes.length > 0);
        expect(hasNotes).toBe(true);
      }
    });

    it('uses eighth note patterns (8 beats per bar)', () => {
      const score = createDrumsDemo();
      const voice = score.tracks[0].staves[0].bars[0].voices[0];
      expect(voice.beats.length).toBe(8);
    });

    it('exports to GP7', () => {
      const score = createDrumsDemo();
      const gp7 = exportToGp7(score);
      expect(gp7.length).toBeGreaterThan(0);
    });
  });

  describe('bass demo', () => {
    it('creates a valid score', () => {
      const score = createBassDemo();
      expect(score.title).toBe('Rock Bass Line');
      expect(score.tracks.length).toBe(1);
      expect(score.masterBars.length).toBe(8);
    });

    it('uses bass finger MIDI program (33)', () => {
      const score = createBassDemo();
      expect(score.tracks[0].playbackInfo.program).toBe(33);
    });

    it('has 4-string bass tuning', () => {
      const score = createBassDemo();
      const staff = score.tracks[0].staves[0];
      expect(staff.isPercussion).toBe(false);
      expect(staff.showTablature).toBe(true);
      expect(staff.stringTuning.tunings.length).toBe(4);
    });

    it('all 8 bars have beats', () => {
      const score = createBassDemo();
      const staff = score.tracks[0].staves[0];

      for (let bar = 0; bar < 8; bar++) {
        const voice = staff.bars[bar].voices[0];
        expect(voice.beats.length).toBeGreaterThan(0);
        const hasNotes = voice.beats.some((b: any) => !b.isEmpty && b.notes.length > 0);
        expect(hasNotes).toBe(true);
      }
    });

    it('notes use valid bass string range (1-4)', () => {
      const score = createBassDemo();
      const staff = score.tracks[0].staves[0];

      for (const bar of staff.bars) {
        for (const beat of bar.voices[0].beats) {
          if (!beat.isEmpty) {
            for (const note of beat.notes) {
              expect(note.string).toBeGreaterThanOrEqual(1);
              expect(note.string).toBeLessThanOrEqual(4);
              expect(note.fret).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }
    });

    it('exports to GP7', () => {
      const score = createBassDemo();
      const gp7 = exportToGp7(score);
      expect(gp7.length).toBeGreaterThan(0);
    });

    it('exports to AlphaTex', () => {
      const score = createBassDemo();
      const tex = exportToAlphaTex(score);
      expect(tex.length).toBeGreaterThan(0);
    });
  });
});
