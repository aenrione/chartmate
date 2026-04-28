import {describe, expect, it} from 'vitest';
import type {ProgressEvent} from '../events';
import {
  absoluteProgressForEvent,
  findMissionTemplate,
  MISSION_CATALOG,
  progressDeltaForEvent,
} from '../missions';

const lesson = (overrides: Partial<Extract<ProgressEvent, {kind: 'lesson_completed'}>> = {}): ProgressEvent => ({
  kind: 'lesson_completed',
  instrument: 'guitar',
  unitId: 'u1',
  lessonId: 'l1',
  heartsLost: 0,
  accuracy: 1,
  lessonXp: 15,
  ...overrides,
});

describe('catalog integrity', () => {
  it('every catalog id is unique', () => {
    const ids = MISSION_CATALOG.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('findMissionTemplate resolves known ids', () => {
    expect(findMissionTemplate('path_walker')?.target).toBe(3);
    expect(findMissionTemplate('does-not-exist')).toBeUndefined();
  });
});

describe('progressDeltaForEvent — rudiment_milestone', () => {
  const tempo = findMissionTemplate('tempo_climb')!;

  it('advances by 1 when a +10 bpm milestone is hit', () => {
    expect(progressDeltaForEvent(
      tempo,
      {kind: 'rudiment_practiced', rudimentId: 'r', bpm: 100, sustainedBars: 10},
      {rudimentMilestoneHit: true},
    )).toBe(1);
  });

  it('does not advance when no milestone was hit', () => {
    expect(progressDeltaForEvent(
      tempo,
      {kind: 'rudiment_practiced', rudimentId: 'r', bpm: 100, sustainedBars: 10},
      {rudimentMilestoneHit: false},
    )).toBe(0);
  });

  it('does not advance for unrelated events', () => {
    expect(progressDeltaForEvent(tempo, lesson(), {})).toBe(0);
  });
});

describe('progressDeltaForEvent — event_count with where', () => {
  const path = findMissionTemplate('path_walker')!;
  const ear = findMissionTemplate('ear_sharpener')!;
  const playbook = findMissionTemplate('clean_run')!;

  it('Path Walker counts only first-play lessons', () => {
    expect(progressDeltaForEvent(path, lesson(), {isFirstLessonPlay: true})).toBe(1);
    expect(progressDeltaForEvent(path, lesson(), {isFirstLessonPlay: false})).toBe(0);
  });

  it('Ear Sharpener requires >=85% accuracy', () => {
    expect(progressDeltaForEvent(
      ear,
      {kind: 'ear_session_finished', exerciseType: 't', difficulty: 'medium', correct: 9, total: 10, sessionId: 1},
      {},
    )).toBe(1);
    expect(progressDeltaForEvent(
      ear,
      {kind: 'ear_session_finished', exerciseType: 't', difficulty: 'medium', correct: 7, total: 10, sessionId: 1},
      {},
    )).toBe(0);
  });

  it('Clean Run requires nailed_it AND no rewinds', () => {
    expect(progressDeltaForEvent(
      playbook,
      {kind: 'playbook_section_status', songId: 's1', sectionId: 1, status: 'nailed_it', noRewinds: true},
      {},
    )).toBe(1);
    expect(progressDeltaForEvent(
      playbook,
      {kind: 'playbook_section_status', songId: 's1', sectionId: 1, status: 'nailed_it', noRewinds: false},
      {},
    )).toBe(0);
    expect(progressDeltaForEvent(
      playbook,
      {kind: 'playbook_section_status', songId: 's1', sectionId: 1, status: 'practicing', noRewinds: true},
      {},
    )).toBe(0);
  });
});

describe('absoluteProgressForEvent — distinct_surfaces', () => {
  const cross = findMissionTemplate('two_surface_tuesday')!;

  it('returns the size of the weekly distinct-surface set', () => {
    expect(absoluteProgressForEvent(cross, lesson(), {weeklyDistinctSurfaces: new Set(['lesson', 'rudiment', 'ear'])})).toBe(3);
    expect(absoluteProgressForEvent(cross, lesson(), {})).toBe(0);
  });

  it('returns null for non-absolute triggers', () => {
    const path = findMissionTemplate('path_walker')!;
    expect(absoluteProgressForEvent(path, lesson(), {})).toBeNull();
  });
});
