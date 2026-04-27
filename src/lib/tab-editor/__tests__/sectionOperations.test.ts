import {describe, it, expect} from 'vitest';
import {createBlankScore} from '../newScore';
import {setBarSection, removeBarSection, getSections} from '../scoreOperations';

describe('getSections', () => {
  it('returns empty array when no sections are set', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    expect(getSections(score)).toEqual([]);
  });
});

describe('setBarSection', () => {
  it('sets a section on the given bar', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    setBarSection(score, 0, 'Verse');
    const sections = getSections(score);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('Verse');
    expect(sections[0].startBar).toBe(0);
    expect(sections[0].endBar).toBe(3); // last bar of score
  });

  it('derives endBar from the next section start', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 8, instrument: 'guitar'});
    setBarSection(score, 0, 'Verse');
    setBarSection(score, 4, 'Chorus');
    const sections = getSections(score);
    expect(sections).toHaveLength(2);
    expect(sections[0].endBar).toBe(3);
    expect(sections[1].startBar).toBe(4);
    expect(sections[1].endBar).toBe(7);
  });

  it('overwrites an existing section at the same bar', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    setBarSection(score, 0, 'Verse');
    setBarSection(score, 0, 'Intro');
    const sections = getSections(score);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('Intro');
  });
});

describe('removeBarSection', () => {
  it('removes the section from the given bar', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    setBarSection(score, 0, 'Verse');
    removeBarSection(score, 0);
    expect(getSections(score)).toEqual([]);
  });

  it('is a no-op when no section exists at the given bar', () => {
    const score = createBlankScore({title: '', tempo: 120, measureCount: 4, instrument: 'guitar'});
    expect(() => removeBarSection(score, 0)).not.toThrow();
    expect(getSections(score)).toEqual([]);
  });
});
