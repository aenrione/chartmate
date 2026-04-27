// src/lib/local-db/learn.ts
import type {Kysely} from 'kysely';
import {getLocalDb} from './client';
import {todayIso, shouldIncrementStreak, shouldResetStreak} from '@/lib/learn/gamification';
import type {DB} from './types';

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

/** Insert a default streak row with zero counters. Used in both setDailyGoalTarget and syncStreakAfterXp. */
async function insertDefaultStreakRow(
  db: Kysely<DB>,
  today: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insertInto('learn_streaks')
    .values({
      current_streak: 0,
      longest_streak: 0,
      last_active_date: today,
      daily_goal_target: 10,
      updated_at: now,
      singleton: 1,
    })
    .execute();
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

export async function recordXp(
  amount: number,
  source: 'lesson' | 'heart_bonus',
  instrument: string,
  lessonId: string,
): Promise<void> {
  const db = await getLocalDb();
  // Idempotent: skip if the same (instrument, lesson_id, source) was already recorded today.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const existing = await db
    .selectFrom('learn_xp_ledger')
    .select('id')
    .where('instrument', '=', instrument)
    .where('lesson_id', '=', lessonId)
    .where('source', '=', source)
    .where('earned_at', '>=', startOfToday.toISOString())
    .where('earned_at', '<', startOfTomorrow.toISOString())
    .executeTakeFirst();

  if (existing) return;

  await db
    .insertInto('learn_xp_ledger')
    .values({
      amount,
      source,
      instrument,
      lesson_id: lessonId,
      earned_at: new Date().toISOString(),
    })
    .execute();
}

export async function syncStreakAfterXp(): Promise<{
  dailyGoalMet: boolean;
  newStreak: number;
  todayXp: number;
  dailyGoalTarget: number;
}> {
  const db = await getLocalDb();
  const today = todayIso();

  return db.transaction().execute(async trx => {
    // Sum today's XP from ledger using ISO string range (avoids SQLite date() function)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const xpResult = await trx
      .selectFrom('learn_xp_ledger')
      .select(eb => eb.fn.sum<number>('amount').as('total'))
      .where('earned_at', '>=', startOfToday.toISOString())
      .where('earned_at', '<', startOfTomorrow.toISOString())
      .executeTakeFirst();
    const todayXp = Number(xpResult?.total ?? 0);

    // Get streak row (may not exist yet)
    const streakRow = await trx
      .selectFrom('learn_streaks')
      .selectAll()
      .executeTakeFirst();
    const dailyGoalTarget: number = streakRow?.daily_goal_target ?? 10;

    // Get or create today's daily_goal row
    const goalRow = await trx
      .selectFrom('learn_daily_goal')
      .selectAll()
      .where('date', '=', today)
      .executeTakeFirst();

    if (!goalRow) {
      await trx
        .insertInto('learn_daily_goal')
        .values({date: today, target_xp: dailyGoalTarget, xp_earned: todayXp, completed: 0})
        .execute();
    } else {
      await trx
        .updateTable('learn_daily_goal')
        .set({xp_earned: todayXp})
        .where('date', '=', today)
        .execute();
    }

    // Check if daily goal was just met for the first time today
    const alreadyCompleted = goalRow?.completed === 1;
    const goalJustMet = todayXp >= dailyGoalTarget && !alreadyCompleted;
    let newStreak = streakRow?.current_streak ?? 0;

    if (goalJustMet) {
      await trx
        .updateTable('learn_daily_goal')
        .set({completed: 1})
        .where('date', '=', today)
        .execute();

      const lastActive: string | null = streakRow?.last_active_date ?? null;
      if (shouldIncrementStreak(lastActive, today)) {
        newStreak = (streakRow?.current_streak ?? 0) + 1;
      } else if (shouldResetStreak(lastActive, today)) {
        newStreak = 1;
      }
      const longestStreak = Math.max(streakRow?.longest_streak ?? 0, newStreak);
      const now = new Date().toISOString();

      if (!streakRow) {
        await trx
          .insertInto('learn_streaks')
          .values({
            current_streak: newStreak,
            longest_streak: longestStreak,
            last_active_date: today,
            daily_goal_target: dailyGoalTarget,
            updated_at: now,
            singleton: 1,
          })
          .execute();
      } else {
        await trx
          .updateTable('learn_streaks')
          .set({
            current_streak: newStreak,
            longest_streak: longestStreak,
            last_active_date: today,
            updated_at: now,
          })
          .execute();
      }
    }

    // dailyGoalMet uses the DB persisted value OR just-set-now to avoid re-firing celebration
    const dailyGoalMet = goalRow?.completed === 1 || goalJustMet;
    return {dailyGoalMet, newStreak, todayXp, dailyGoalTarget};
  });
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
    dailyGoalTarget: streakRow?.daily_goal_target ?? 10,
    todayXp: goalRow?.xp_earned ?? 0,
    dailyGoalCompleted: goalRow?.completed === 1,
  };
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
