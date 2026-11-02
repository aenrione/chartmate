import {describe, it, expect} from 'vitest';
import {normalizeTags, tagKey} from '../composition-tags';

describe('tagKey', () => {
  it('trims and lowercases', () => {
    expect(tagKey('  Fingerstyle ')).toBe('fingerstyle');
  });

  it('lowercases non-ASCII letters too', () => {
    expect(tagKey('CANCIÓN')).toBe('canción');
  });
});

describe('normalizeTags', () => {
  it('trims and drops empty tags', () => {
    expect(normalizeTags(['  rock ', '', '   ', 'blues'])).toEqual(['rock', 'blues']);
  });

  it('dedupes ignoring case and keeps the first spelling', () => {
    expect(normalizeTags(['To Learn', 'to learn', 'TO LEARN', 'Rock'])).toEqual(['To Learn', 'Rock']);
  });

  it('dedupes after trimming', () => {
    expect(normalizeTags(['rock', ' Rock  '])).toEqual(['rock']);
  });

  it('keeps the order the user typed', () => {
    expect(normalizeTags(['zeta', 'alpha', 'mid'])).toEqual(['zeta', 'alpha', 'mid']);
  });

  it('ignores non-string values', () => {
    expect(normalizeTags(['ok', 3, null, undefined, {}, 'fine'])).toEqual(['ok', 'fine']);
  });

  it('dedupes non-ASCII case variants', () => {
    expect(normalizeTags(['Canción', 'CANCIÓN'])).toEqual(['Canción']);
  });

  it('returns an empty list for no input', () => {
    expect(normalizeTags([])).toEqual([]);
  });
});
