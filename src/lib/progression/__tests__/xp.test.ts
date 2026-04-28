import {describe, expect, it} from 'vitest';
import type {ProgressEvent} from '../events';
import {
  computeXpForEvent,
  DAILY_CAP_BY_SURFACE,
  LESSON_MASTERY_BONUS_WEEKLY_CAP,
  type XpContext,
} from '../xp';

const CTX: XpContext = {
  today: '2026-04-27',
  weekStart: '2026-04-27',
  isFirstLessonPlay: true,
  starsRaisedOnRetry: false,
  weeklyMasteryBonusForLesson: 0,
  todayXpForSurfaceInstrument: 0,
  bpmMilestoneAlreadyHit: false,
  alreadyPlayedSongToday: false,
};

function lessonEvent(overrides: Partial<Extract<ProgressEvent, {kind: 'lesson_completed'}>> = {}) {
  return {
    kind: 'lesson_completed' as const,
    instrument: 'guitar' as const,
    unitId: 'u1',
    lessonId: 'l1',
    heartsLost: 0,
    accuracy: 1,
    lessonXp: 15,
    ...overrides,
  };
}

describe('lesson_completed', () => {
  it('grants base XP + heart bonus on first play with no hearts lost', () => {
    const out = computeXpForEvent(lessonEvent(), CTX);
    expect(out.surface).toBe('lesson');
    expect(out.instrument).toBe('guitar');
    expect(out.refId).toBe('l1');
    expect(out.countedXp).toBe(18); // 15 + 3
    expect(out.cappedAmount).toBe(0);
    expect(out.dedupeKey).toBe('lesson:first:l1');
  });

  it('omits the heart bonus when hearts were lost', () => {
    const out = computeXpForEvent(lessonEvent({heartsLost: 1}), CTX);
    expect(out.countedXp).toBe(15);
  });

  it('grants only a small mastery bonus on rerun, capped weekly', () => {
    const out = computeXpForEvent(
      lessonEvent({lessonXp: 99}), // base XP is irrelevant on rerun
      {...CTX, isFirstLessonPlay: false, starsRaisedOnRetry: true},
    );
    expect(out.countedXp).toBe(2);
    expect(out.dedupeKey).toContain('lesson:mastery:l1');
  });

  it('grants 1 XP if rerun stars did not improve', () => {
    const out = computeXpForEvent(
      lessonEvent(),
      {...CTX, isFirstLessonPlay: false, starsRaisedOnRetry: false},
    );
    expect(out.countedXp).toBe(1);
  });

  it('stops awarding mastery XP once the weekly cap is reached', () => {
    const out = computeXpForEvent(
      lessonEvent(),
      {
        ...CTX,
        isFirstLessonPlay: false,
        starsRaisedOnRetry: true,
        weeklyMasteryBonusForLesson: LESSON_MASTERY_BONUS_WEEKLY_CAP,
      },
    );
    expect(out.countedXp).toBe(0);
    expect(out.dedupeKey).toBeNull();
  });
});

describe('rudiment_practiced', () => {
  it('grants base XP plus sustained-bars bonus and a milestone bonus', () => {
    const out = computeXpForEvent(
      {kind: 'rudiment_practiced', rudimentId: 'single-stroke', bpm: 100, sustainedBars: 32},
      CTX,
    );
    expect(out.countedXp).toBe(4 + 3 + 5); // base + sustained + milestone
    expect(out.surface).toBe('rudiment');
    expect(out.instrument).toBe('drums');
    expect(out.dedupeKey).toBe('rudiment:single-stroke:2026-04-27:100');
  });

  it('caps the day at 25 XP', () => {
    const out = computeXpForEvent(
      {kind: 'rudiment_practiced', rudimentId: 'r', bpm: 100, sustainedBars: 32},
      {...CTX, todayXpForSurfaceInstrument: 24},
    );
    expect(out.countedXp).toBe(1); // only 1 XP of room left
    expect(out.cappedAmount).toBe(11); // 12 requested - 1 counted = 11 capped
  });

  it('skips milestone bonus when already hit', () => {
    const out = computeXpForEvent(
      {kind: 'rudiment_practiced', rudimentId: 'r', bpm: 100, sustainedBars: 32},
      {...CTX, bpmMilestoneAlreadyHit: true},
    );
    expect(out.countedXp).toBe(7); // base + sustained, no milestone
  });
});

describe('ear_session_finished', () => {
  it('grants nothing below the pass threshold', () => {
    const out = computeXpForEvent(
      {kind: 'ear_session_finished', exerciseType: 't', difficulty: 'medium', correct: 3, total: 10, sessionId: 1},
      CTX,
    );
    expect(out.countedXp).toBe(0);
    expect(out.dedupeKey).toBeNull();
  });

  it('scales XP by difficulty', () => {
    const easy = computeXpForEvent(
      {kind: 'ear_session_finished', exerciseType: 't', difficulty: 'easy', correct: 8, total: 10, sessionId: 1},
      CTX,
    );
    const hard = computeXpForEvent(
      {kind: 'ear_session_finished', exerciseType: 't', difficulty: 'hard', correct: 8, total: 10, sessionId: 2},
      CTX,
    );
    expect(easy.countedXp).toBe(6); // 6 * 1.0
    expect(hard.countedXp).toBe(9); // 6 * 1.5 = 9
  });

  it('adds an accuracy bonus at 90%', () => {
    const out = computeXpForEvent(
      {kind: 'ear_session_finished', exerciseType: 't', difficulty: 'medium', correct: 9, total: 10, sessionId: 5},
      CTX,
    );
    // 6 * 1.25 = 7.5 → 8 base + 4 bonus = 12
    expect(out.countedXp).toBe(12);
  });
});

describe('repertoire_review', () => {
  it('grants the first end-to-end run of a song that day', () => {
    const out = computeXpForEvent(
      {kind: 'repertoire_review', songId: 'song-1', quality: 4, atTargetTempo: true},
      CTX,
    );
    expect(out.countedXp).toBe(12); // 8 base + 4 tempo
    expect(out.dedupeKey).toBe('repertoire:song-1:2026-04-27');
  });

  it('grants nothing on subsequent runs the same day', () => {
    const out = computeXpForEvent(
      {kind: 'repertoire_review', songId: 'song-1', quality: 4, atTargetTempo: true},
      {...CTX, alreadyPlayedSongToday: true},
    );
    expect(out.countedXp).toBe(0);
    expect(out.dedupeKey).toBeNull();
  });
});

describe('playbook_section_status', () => {
  it('grants nothing for non-nailed-it status', () => {
    const out = computeXpForEvent(
      {kind: 'playbook_section_status', songId: 'song-1', sectionId: 5, status: 'practicing', noRewinds: false},
      CTX,
    );
    expect(out.countedXp).toBe(0);
  });

  it('grants base + clean-run bonus on nailed_it with no rewinds', () => {
    const out = computeXpForEvent(
      {kind: 'playbook_section_status', songId: 'song-1', sectionId: 5, status: 'nailed_it', noRewinds: true},
      CTX,
    );
    expect(out.countedXp).toBe(8);
    expect(out.dedupeKey).toBe('playbook:song-1:5:2026-04-27');
  });
});

describe('tab_session_finished', () => {
  it('records the event but awards no recurring XP', () => {
    const out = computeXpForEvent(
      {kind: 'tab_session_finished', compositionId: 7, measuresAdded: 32},
      CTX,
    );
    expect(out.countedXp).toBe(0);
    expect(out.surface).toBe('tab_session');
    expect(out.dedupeKey).toBe('tab_session:7:2026-04-27');
  });
});

describe('program_goal_completed', () => {
  it('grants 15 XP per goal, no daily cap', () => {
    const out = computeXpForEvent(
      {kind: 'program_goal_completed', goalId: 42, programId: 1},
      {...CTX, todayXpForSurfaceInstrument: 9999},
    );
    expect(out.countedXp).toBe(15);
    expect(out.cappedAmount).toBe(0);
    expect(out.dedupeKey).toBe('program_goal:42');
  });
});

describe('DAILY_CAP_BY_SURFACE table', () => {
  it('matches the documented per-surface caps', () => {
    expect(DAILY_CAP_BY_SURFACE.rudiment).toBe(25);
    expect(DAILY_CAP_BY_SURFACE.fill).toBe(20);
    expect(DAILY_CAP_BY_SURFACE.ear).toBe(30);
    expect(DAILY_CAP_BY_SURFACE.fretboard).toBe(25);
    expect(DAILY_CAP_BY_SURFACE.repertoire).toBe(30);
    expect(DAILY_CAP_BY_SURFACE.playbook).toBe(25);
    expect(DAILY_CAP_BY_SURFACE.lesson).toBe(Infinity);
    expect(DAILY_CAP_BY_SURFACE.program_goal).toBe(Infinity);
  });
});
