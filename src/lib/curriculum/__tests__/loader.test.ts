import {describe, it, expect} from 'vitest';
import {parseSkillTree, parseLesson, resolveLessonId, resolveUnitId} from '../loader';

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
