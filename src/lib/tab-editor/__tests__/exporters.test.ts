import {describe, it, expect} from 'vitest';
import {createBlankScore} from '../newScore';
import {setNote} from '../scoreOperations';
import {exportToAlphaTex, exportToGp7, exportToAsciiTab} from '../exporters';
import type {EditorCursor} from '../useEditorCursor';

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

describe('exporters', () => {
  describe('exportToAlphaTex', () => {
    it('exports a blank score to AlphaTex string', () => {
      const score = createBlankScore({measureCount: 2});
      const tex = exportToAlphaTex(score);
      expect(typeof tex).toBe('string');
      expect(tex.length).toBeGreaterThan(0);
    });

    it('exported AlphaTex contains title', () => {
      const score = createBlankScore({title: 'Test Song', measureCount: 2});
      const tex = exportToAlphaTex(score);
      expect(tex).toContain('Test Song');
    });
  });

  describe('exportToGp7', () => {
    it('exports to Uint8Array (GP7 binary)', () => {
      const score = createBlankScore({measureCount: 2});
      const data = exportToGp7(score);
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBeGreaterThan(0);
    });
  });

  describe('exportToAsciiTab', () => {
    it('exports blank score to ASCII', () => {
      const score = createBlankScore({measureCount: 2, instrument: 'guitar'});
      const ascii = exportToAsciiTab(score);
      expect(typeof ascii).toBe('string');
      expect(ascii).toContain('Guitar');
    });

    it('shows fret numbers in ASCII output', () => {
      const score = createBlankScore({measureCount: 2, instrument: 'guitar'});
      setNote(score, makeCursor({stringNumber: 1}), 5);
      const ascii = exportToAsciiTab(score);
      expect(ascii).toContain('5');
    });

    it('skips percussion tracks', () => {
      const score = createBlankScore({measureCount: 2, instrument: 'drums'});
      const ascii = exportToAsciiTab(score);
      // Drums should be skipped, so no "Drums" header
      expect(ascii).not.toContain('Drums');
    });
  });
});
