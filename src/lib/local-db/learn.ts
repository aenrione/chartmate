import type {Kysely} from 'kysely';
import {getLocalDb} from './client';
import {todayIso} from '@/lib/learn/gamification';
import type {DB} from './types';
import {DEFAULT_DAILY_GOAL_XP} from '@/lib/progression/xp';

export interface LearnProgress {
  id: number;
  instrument: string;
  unitId: string;
  lessonId: string;
  completedAt: string;
}

function rowToProgress(row: {
  id: number;
  instrument: string;
  unit_id: string;
  lesson_id: string;
  completed_at: string;
}): LearnProgress {
  return {
    id: row.id,
    instrument: row.instrument,
    unitId: row.unit_id,
    lessonId: row.lesson_id,
    completedAt: row.completed_at,
  };
}

export async function markLessonCompleted(
  instrument: string,
  unitId: string,
  lessonId: string,
): Promise<void> {
  const db = await getLocalDb();
  await db
    .insertInto('learn_progress')
    .values({
      instrument,
      unit_id: unitId,
      lesson_id: lessonId,
      completed_at: new Date().toISOString(),
    })
    .onConflict(oc => oc.columns(['instrument', 'unit_id', 'lesson_id']).doNothing())
    .execute();
}

export async function getCompletedLessons(instrument: string): Promise<LearnProgress[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('learn_progress')
    .selectAll()
    .where('instrument', '=', instrument)
    .execute();
  return rows.map(rowToProgress);
}

export async function isLessonCompleted(
  instrument: string,
  unitId: string,
  lessonId: string,
): Promise<boolean> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('learn_progress')
    .select('id')
    .where('instrument', '=', instrument)
    .where('unit_id', '=', unitId)
    .where('lesson_id', '=', lessonId)
    .executeTakeFirst();
  return !!row;
}

export async function getCompletedLessonIds(
  instrument: string,
  unitId: string,
): Promise<Set<string>> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('learn_progress')
    .select('lesson_id')
    .where('instrument', '=', instrument)
    .where('unit_id', '=', unitId)
    .execute();
  return new Set(rows.map(r => r.lesson_id));
}

export async function getLearnStats(): Promise<{
  streak: number;
  longestStreak: number;
  dailyGoalTarget: number;
  todayXp: number;
  dailyGoalCompleted: boolean;
}> {
  const db = await getLocalDb();
  const today = todayIso();

  const streakRow = await db
    .selectFrom('learn_streaks')
    .selectAll()
    .executeTakeFirst();

  const goalRow = await db
    .selectFrom('learn_daily_goal')
    .selectAll()
    .where('date', '=', today)
    .executeTakeFirst();

  return {
    streak: streakRow?.current_streak ?? 0,
    longestStreak: streakRow?.longest_streak ?? 0,
    dailyGoalTarget: streakRow?.daily_goal_target ?? DEFAULT_DAILY_GOAL_XP,
    todayXp: goalRow?.xp_earned ?? 0,
    dailyGoalCompleted: goalRow?.completed === 1,
  };
}

/** Map of lessonId → stars (1..3) for an instrument's unit. Used by SkillTree to render ★★☆. */
export async function getLessonStarsForUnit(
  instrument: string,
  unitId: string,
): Promise<Map<string, 1 | 2 | 3>> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('lesson_stars')
    .select(['lesson_id', 'stars'])
    .where('instrument', '=', instrument)
    .where('unit_id', '=', unitId)
    .execute();
  return new Map(rows.map(r => [r.lesson_id, r.stars as 1 | 2 | 3]));
}

export interface InstrumentLevelView {
  instrument: string;
  cum_xp: number;
  level: number;
  xp_into_level: number;
  xp_to_next: number;
}

/**
 * Daily XP totals across the given inclusive date range. Keys are YYYY-MM-DD (local).
 * Includes ALL surfaces (lessons + non-learn). Used by the calendar overlay.
 */
export async function getDailyXpForRange(
  fromDate: string,
  toDate: string,
): Promise<Map<string, number>> {
  const db = await getLocalDb();
  // earned_at is an ISO datetime string. We bucket by the local-time date prefix using
  // ISO date math and group in JS — keeps the SQL portable across SQLite versions.
  const start = new Date(`${fromDate}T00:00:00`);
  const endExclusive = new Date(`${toDate}T00:00:00`);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const rows = await db
    .selectFrom('learn_xp_ledger')
    .select(['amount', 'earned_at'])
    .where('earned_at', '>=', start.toISOString())
    .where('earned_at', '<', endExclusive.toISOString())
    .execute();
  const out = new Map<string, number>();
  for (const r of rows) {
    const localDate = new Date(r.earned_at).toLocaleDateString('sv'); // YYYY-MM-DD local
    out.set(localDate, (out.get(localDate) ?? 0) + r.amount);
  }
  return out;
}

/** Set of YYYY-MM-DD dates within range where the daily goal was met. */
export async function getGoalMetDatesForRange(
  fromDate: string,
  toDate: string,
): Promise<Set<string>> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('learn_daily_goal')
    .select('date')
    .where('date', '>=', fromDate)
    .where('date', '<=', toDate)
    .where('completed', '=', 1)
    .execute();
  return new Set(rows.map(r => r.date));
}

/** Set of YYYY-MM-DD dates within range where an achievement was earned. */
export async function getAchievementDatesForRange(
  fromDate: string,
  toDate: string,
): Promise<Set<string>> {
  const db = await getLocalDb();
  const start = new Date(`${fromDate}T00:00:00`);
  const endExclusive = new Date(`${toDate}T00:00:00`);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const rows = await db
    .selectFrom('earned_achievements')
    .select('earned_at')
    .where('earned_at', '>=', start.toISOString())
    .where('earned_at', '<', endExclusive.toISOString())
    .execute();
  return new Set(rows.map(r => new Date(r.earned_at).toLocaleDateString('sv')));
}

/** All three instrument level rows (or empty if not seeded yet). */
export async function getAllInstrumentLevels(): Promise<InstrumentLevelView[]> {
  const db = await getLocalDb();
  const rows = await db.selectFrom('instrument_levels').selectAll().execute();
  return rows.map(r => ({
    instrument: r.instrument,
    cum_xp: r.cum_xp,
    level: r.level,
    xp_into_level: r.xp_into_level,
    xp_to_next: r.xp_to_next,
  }));
}

/** Map of (unit_id) → minimum-stars-across-its-lessons. A unit with min=3 has gold-pip status. */
export async function getUnitMinStars(instrument: string): Promise<Map<string, number>> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('lesson_stars')
    .select(['unit_id', eb => eb.fn.min<number>('stars').as('min_stars')])
    .where('instrument', '=', instrument)
    .groupBy('unit_id')
    .execute();
  return new Map(rows.map(r => [r.unit_id, Number(r.min_stars)]));
}

export async function setDailyGoalTarget(targetXp: number): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const existing = await db
    .selectFrom('learn_streaks')
    .select('id')
    .executeTakeFirst();

  if (!existing) {
    await db
      .insertInto('learn_streaks')
      .values({
        current_streak: 0,
        longest_streak: 0,
        last_active_date: null,
        daily_goal_target: targetXp,
        updated_at: now,
        singleton: 1,
      })
      .execute();
  } else {
    await db
      .updateTable('learn_streaks')
      .set({daily_goal_target: targetXp, updated_at: now})
      .execute();
  }
}
