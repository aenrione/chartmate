import {describe, it, expect} from 'vitest';
import {parseSkillTree, parseLesson, resolveLessonId, resolveUnitId, mergeUnits} from '../loader';

describe('parseSkillTree', () => {
  it('returns a valid SkillTree from raw JSON', () => {
    const raw = {
      instrument: 'guitar',
      version: '1.0',
      units: [{
        id: '01-open-chords',
        title: 'Open Chords',
        description: 'desc',
        prerequisites: [],
        lessons: ['01-intro'],
      }],
    };
    const tree = parseSkillTree(raw);
    expect(tree.instrument).toBe('guitar');
    expect(tree.units).toHaveLength(1);
    expect(tree.units[0].id).toBe('01-open-chords');
  });
});

describe('parseLesson', () => {
  it('returns a valid Lesson from raw JSON', () => {
    const raw = {
      id: '01-intro',
      title: 'Intro',
      xp: 10,
      activities: [{type: 'theory-card', markdown: '# Hello', srs: true}],
    };
    const lesson = parseLesson(raw);
    expect(lesson.id).toBe('01-intro');
    expect(lesson.activities).toHaveLength(1);
    expect(lesson.activities[0].type).toBe('theory-card');
  });
});

describe('resolveLessonId', () => {
  it('strips .json extension from filename', () => {
    expect(resolveLessonId('01-intro.json')).toBe('01-intro');
    expect(resolveLessonId('01-intro')).toBe('01-intro');
  });
});

describe('resolveUnitId', () => {
  it('returns directory name unchanged', () => {
    expect(resolveUnitId('01-open-chords')).toBe('01-open-chords');
  });
});

describe('mergeUnits', () => {
  const bundled = [
    {id: 'a', title: 'A', description: '', prerequisites: [], lessons: ['a1']},
    {id: 'b', title: 'B', description: '', prerequisites: [], lessons: ['b1']},
  ];

  it('returns bundled untouched when there is no user layer', () => {
    expect(mergeUnits(bundled, null)).toEqual(bundled);
    expect(mergeUnits(bundled, [])).toEqual(bundled);
  });

  it('overrides a bundled unit with the user unit of the same id, in place', () => {
    const user = [{id: 'b', title: 'B custom', description: '', prerequisites: [], lessons: ['x']}];
    const merged = mergeUnits(bundled, user);
    expect(merged).toHaveLength(2);
    expect(merged[1].title).toBe('B custom');
    expect(merged[0].title).toBe('A');
  });

  it('appends user units with new ids after the bundled ones', () => {
    const user = [{id: 'c', title: 'C', description: '', prerequisites: ['b'], lessons: []}];
    const merged = mergeUnits(bundled, user);
    expect(merged.map(u => u.id)).toEqual(['a', 'b', 'c']);
  });
});
