// src/lib/local-db/learn.ts
import {getLocalDb} from './client';
import {todayIso, shouldIncrementStreak, shouldResetStreak} from '@/lib/learn/gamification';

export interface LearnProgress {
  id: number;
  instrument: string;
  unitId: string;
  lessonId: string;
  completedAt: string;
}

function rowToProgress(row: any): LearnProgress {
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
    .insertInto('learn_progress' as any)
    .values({
      instrument,
      unit_id: unitId,
      lesson_id: lessonId,
      completed_at: new Date().toISOString(),
    })
    .onConflict(oc => oc.constraint('uq_learn_progress').doNothing())
    .execute();
}

export async function getCompletedLessons(instrument: string): Promise<LearnProgress[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('learn_progress' as any)
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
    .selectFrom('learn_progress' as any)
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
    .selectFrom('learn_progress' as any)
    .select('lesson_id')
    .where('instrument', '=', instrument)
    .where('unit_id', '=', unitId)
    .execute();
  return new Set(rows.map((r: any) => r.lesson_id));
}

export async function recordXp(
  amount: number,
  source: 'lesson' | 'heart_bonus',
  instrument: string,
  lessonId: string,
): Promise<void> {
  const db = await getLocalDb();
  await db
    .insertInto('learn_xp_ledger' as any)
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

  // Sum today's XP from ledger using ISO string range (avoids SQLite date() function)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const xpResult = await db
    .selectFrom('learn_xp_ledger' as any)
    .select((eb: any) => eb.fn.sum('amount').as('total'))
    .where('earned_at', '>=', startOfToday.toISOString())
    .where('earned_at', '<', startOfTomorrow.toISOString())
    .executeTakeFirst() as any;
  const todayXp = Number(xpResult?.total ?? 0);

  // Get streak row (may not exist yet)
  const streakRow = await db
    .selectFrom('learn_streaks' as any)
    .selectAll()
    .executeTakeFirst() as any;
  const dailyGoalTarget: number = streakRow?.daily_goal_target ?? 10;

  // Get or create today's daily_goal row
  const goalRow = await db
    .selectFrom('learn_daily_goal' as any)
    .selectAll()
    .where('date', '=', today)
    .executeTakeFirst() as any;

  if (!goalRow) {
    await db
      .insertInto('learn_daily_goal' as any)
      .values({date: today, target_xp: dailyGoalTarget, xp_earned: todayXp, completed: 0})
      .execute();
  } else {
    await db
      .updateTable('learn_daily_goal' as any)
      .set({xp_earned: todayXp})
      .where('date', '=', today)
      .execute();
  }

  // Check if daily goal was just met for the first time today
  const alreadyCompleted = !!(goalRow?.completed);
  const goalJustMet = todayXp >= dailyGoalTarget && !alreadyCompleted;
  let newStreak = streakRow?.current_streak ?? 0;

  if (goalJustMet) {
    await db
      .updateTable('learn_daily_goal' as any)
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
      await db
        .insertInto('learn_streaks' as any)
        .values({
          current_streak: newStreak,
          longest_streak: longestStreak,
          last_active_date: today,
          daily_goal_target: dailyGoalTarget,
          updated_at: now,
        })
        .execute();
    } else {
      await db
        .updateTable('learn_streaks' as any)
        .set({
          current_streak: newStreak,
          longest_streak: longestStreak,
          last_active_date: today,
          updated_at: now,
        })
        .execute();
    }
  }

  return {dailyGoalMet: goalJustMet, newStreak, todayXp, dailyGoalTarget};
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
    .selectFrom('learn_streaks' as any)
    .selectAll()
    .executeTakeFirst() as any;

  const goalRow = await db
    .selectFrom('learn_daily_goal' as any)
    .selectAll()
    .where('date', '=', today)
    .executeTakeFirst() as any;

  return {
    streak: streakRow?.current_streak ?? 0,
    longestStreak: streakRow?.longest_streak ?? 0,
    dailyGoalTarget: streakRow?.daily_goal_target ?? 10,
    todayXp: goalRow?.xp_earned ?? 0,
    dailyGoalCompleted: !!(goalRow?.completed),
  };
}

export async function setDailyGoalTarget(targetXp: number): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const existing = await db
    .selectFrom('learn_streaks' as any)
    .select('id')
    .executeTakeFirst();

  if (!existing) {
    await db
      .insertInto('learn_streaks' as any)
      .values({
        current_streak: 0,
        longest_streak: 0,
        last_active_date: null,
        daily_goal_target: targetXp,
        updated_at: now,
      })
      .execute();
  } else {
    await db
      .updateTable('learn_streaks' as any)
      .set({daily_goal_target: targetXp, updated_at: now})
      .execute();
  }
}
