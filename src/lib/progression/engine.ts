/**
 * The progression engine. Every practice surface emits a `ProgressEvent` into `recordEvent`,
 * which performs — in a single transaction — XP write (idempotent), star upgrade, level update,
 * streak/daily-goal sync, mission progress, and achievement evaluation, then returns a
 * `ProgressionResult` for the UI to celebrate.
 *
 * Surfaces stay dumb. They emit one event each. All progression policy lives below.
 */

import type {Transaction} from 'kysely';
import {getLocalDb} from '@/lib/local-db/client';
import type {DB} from '@/lib/local-db/types';
import {todayIso, shouldIncrementStreak, shouldResetStreak} from '@/lib/learn/gamification';
import {evaluateAchievements, type AchievementTier} from './achievements';
import type {Instrument, ProgressEvent, ProgressionResult, Surface} from './events';
import {surfaceForEvent} from './events';
import {applyXpToLevels} from './levels';
import {
  absoluteProgressForEvent,
  findMissionTemplate,
  MISSION_CATALOG,
  progressDeltaForEvent,
  type MissionEventContext,
} from './missions';
import {computeLessonStars, type Stars, upgradeStars} from './stars';
import {computeXpForEvent, DEFAULT_DAILY_GOAL_XP, type XpContext} from './xp';

// ---------------------------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------------------------

const ACHIEVEMENT_BONUS_BY_TIER: Record<AchievementTier, number> = {
  bronze: 10,
  silver: 25,
  gold: 50,
};

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * Run the engine for a single event.
 *
 * Side effect: dispatches a `progression-changed` window event with the result so global
 * subscribers (e.g. the TopNav `ProgressionPill`) can refresh without prop drilling. The
 * dispatch is skipped in non-browser environments.
 */
export async function recordEvent(event: ProgressEvent): Promise<ProgressionResult> {
  const db = await getLocalDb();
  const result = await db.transaction().execute(async trx => recordEventInTrx(trx, event));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('progression-changed', {detail: result}));
  }
  return result;
}

/**
 * Like `recordEvent`, but never throws — surface call sites use this to ensure a progression
 * hiccup never masks the underlying user action (e.g. an ear session being saved). Returns
 * `null` on failure so callers can `if (result) { ... }` celebrate level-ups.
 */
export async function recordEventSafely(event: ProgressEvent): Promise<ProgressionResult | null> {
  try {
    return await recordEvent(event);
  } catch (e) {
    console.warn(`progression: ${event.kind} failed`, e);
    return null;
  }
}

/** Exposed for testing — accepts an open transaction so tests can pre-seed and inspect. */
export async function recordEventInTrx(
  trx: Transaction<DB>,
  event: ProgressEvent,
): Promise<ProgressionResult> {
  const today = todayIso();
  const weekStart = mondayOfWeek(today);
  const now = new Date();
  const nowIso = now.toISOString();

  // 1) Build XP context from DB state.
  const xpCtx = await buildXpContext(trx, event, today, weekStart);
  const xpComputation = computeXpForEvent(event, xpCtx);

  // Resolve instrument for events that don't ship one (program_goal, playbook).
  const resolvedInstrument =
    xpComputation.instrument ?? (await resolveInstrumentForEvent(trx, event));

  // 2) Insert the ledger row (idempotent). Returns true iff a new row landed.
  let xpEarnedFromEvent = 0;
  let cappedAmount = 0;
  if (xpComputation.dedupeKey != null) {
    const inserted = await insertLedgerRow(trx, {
      amount: xpComputation.countedXp,
      source: legacySourceForSurface(xpComputation.surface, xpCtx.isFirstLessonPlay, event),
      instrument: resolvedInstrument,
      lesson_id: event.kind === 'lesson_completed' ? event.lessonId : null,
      earned_at: nowIso,
      surface: xpComputation.surface,
      ref_id: xpComputation.refId,
      dedupe_key: xpComputation.dedupeKey,
    });
    if (inserted) {
      xpEarnedFromEvent = xpComputation.countedXp;
      cappedAmount = xpComputation.cappedAmount;
    }
  }

  // 3) Lesson stars (upgrade-only).
  let starsRaisedDelta: {from: number; to: number} | undefined;
  let starsForEvent: Stars | undefined;
  if (event.kind === 'lesson_completed') {
    const result = await upgradeLessonStarsForLesson(trx, event, nowIso);
    starsForEvent = result.stars;
    if (result.raisedFrom != null && result.raisedFrom !== result.stars) {
      starsRaisedDelta = {from: result.raisedFrom, to: result.stars};
    }
  }

  // 4) Levels — only update if XP actually landed AND we know the instrument.
  let leveledUp = false;
  let newLevel: number | undefined;
  if (resolvedInstrument && xpEarnedFromEvent > 0) {
    const delta = await applyXpToInstrumentLevels(trx, resolvedInstrument, xpEarnedFromEvent, nowIso);
    leveledUp = delta.leveledUp;
    newLevel = delta.newLevel;
  }

  // 5) Streak + daily goal sync (the body of the legacy syncStreakAfterXp).
  const streakResult = await syncStreakAndDailyGoal(trx, today);

  // 6) Mission progress.
  const missionResult = await advanceActiveMissions(trx, event, weekStart, nowIso, {
    lessonStars: starsForEvent,
    isFirstLessonPlay: xpCtx.isFirstLessonPlay,
    rudimentMilestoneHit:
      event.kind === 'rudiment_practiced' &&
      !xpCtx.bpmMilestoneAlreadyHit &&
      event.bpm > 0 &&
      event.bpm % 10 === 0,
    weeklyDistinctSurfaces: await getWeeklyDistinctSurfaces(trx, weekStart),
  });

  // 7) Achievements.
  const earnedRows = await trx
    .selectFrom('earned_achievements')
    .select('achievement_id')
    .execute();
  const alreadyEarned = new Set(earnedRows.map(r => r.achievement_id));
  const newAchievements = await evaluateAchievements(trx, event, {
    alreadyEarned,
    currentStreak: streakResult.newStreak,
    weekStart,
    eventLocalDate: now,
  });
  let achievementBonusXp = 0;
  for (const a of newAchievements) {
    await trx
      .insertInto('earned_achievements')
      .values({achievement_id: a.id, earned_at: nowIso, meta: null})
      .onConflict(oc => oc.column('achievement_id').doNothing())
      .execute();
    const bonus = ACHIEVEMENT_BONUS_BY_TIER[a.tier];
    achievementBonusXp += bonus;
    await insertLedgerRow(trx, {
      amount: bonus,
      source: 'achievement_bonus',
      instrument: null,
      lesson_id: null,
      earned_at: nowIso,
      surface: 'achievement_bonus',
      ref_id: a.id,
      dedupe_key: `achievement_bonus:${a.id}`,
    });
  }

  // Achievement + mission bonuses can also push the user over thresholds; re-sync streak/goal
  // if either landed XP. We only do so when there's bonus XP to avoid an extra round-trip.
  const finalStreak =
    achievementBonusXp + missionResult.bonusXp > 0
      ? (await syncStreakAndDailyGoal(trx, today)).newStreak
      : streakResult.newStreak;
  const finalDailyGoalMet =
    achievementBonusXp + missionResult.bonusXp > 0
      ? (await getDailyGoalCompleted(trx, today))
      : streakResult.dailyGoalMet;

  return {
    xpEarned: xpEarnedFromEvent + achievementBonusXp + missionResult.bonusXp,
    xpCappedAmount: cappedAmount,
    leveledUp,
    newLevel,
    starsRaised: starsRaisedDelta,
    achievements: newAchievements.map(a => a.id),
    missionsCompleted: missionResult.completed,
    missionsAdvanced: missionResult.advanced,
    dailyGoalMet: finalDailyGoalMet,
    streak: finalStreak,
  };
}

// ---------------------------------------------------------------------------------------------
// Step 1: build XP context
// ---------------------------------------------------------------------------------------------

async function buildXpContext(
  trx: Transaction<DB>,
  event: ProgressEvent,
  today: string,
  weekStart: string,
): Promise<XpContext> {
  let isFirstLessonPlay = true;
  let starsRaisedOnRetry = false;
  let weeklyMasteryBonusForLesson = 0;
  let alreadyPlayedSongToday = false;
  let bpmMilestoneAlreadyHit = false;

  if (event.kind === 'lesson_completed') {
    const existing = await trx
      .selectFrom('lesson_stars')
      .select('stars')
      .where('instrument', '=', event.instrument)
      .where('unit_id', '=', event.unitId)
      .where('lesson_id', '=', event.lessonId)
      .executeTakeFirst();
    isFirstLessonPlay = !existing;
    if (!isFirstLessonPlay) {
      const previousStars = (existing!.stars as Stars) ?? 1;
      const computedNow = computeLessonStars({heartsLost: event.heartsLost, accuracy: event.accuracy});
      starsRaisedOnRetry = computedNow > previousStars;
    }
    const masteryRow = await trx
      .selectFrom('learn_xp_ledger')
      .select(eb => eb.fn.sum<number>('amount').as('total'))
      .where('surface', '=', 'lesson')
      .where('ref_id', '=', event.lessonId)
      .where('source', '=', 'lesson')
      .where('earned_at', '>=', weekStart)
      // mastery bonuses use a `lesson:mastery:...` dedupe_key prefix
      .where('dedupe_key', 'like', `lesson:mastery:%`)
      .executeTakeFirst();
    weeklyMasteryBonusForLesson = Number(masteryRow?.total ?? 0);
  }

  if (event.kind === 'repertoire_review') {
    const row = await trx
      .selectFrom('learn_xp_ledger')
      .select('id')
      .where('surface', '=', 'repertoire')
      .where('ref_id', '=', event.songId)
      .where('earned_at', '>=', today)
      .executeTakeFirst();
    alreadyPlayedSongToday = !!row;
  }

  if (event.kind === 'rudiment_practiced' && event.bpm > 0 && event.bpm % 10 === 0) {
    const row = await trx
      .selectFrom('learn_xp_ledger')
      .select('id')
      .where('surface', '=', 'rudiment')
      .where('ref_id', '=', event.rudimentId)
      .where('dedupe_key', 'like', `rudiment:${event.rudimentId}:%:${event.bpm}`)
      .executeTakeFirst();
    bpmMilestoneAlreadyHit = !!row;
  }

  // Today's XP for (instrument, surface) for daily-cap math.
  const surface = surfaceForEvent(event);
  const instrument = computeInstrumentForEvent(event);
  let todayXpForSurfaceInstrument = 0;
  if (surface) {
    const q = trx
      .selectFrom('learn_xp_ledger')
      .select(eb => eb.fn.sum<number>('amount').as('total'))
      .where('surface', '=', surface)
      .where('earned_at', '>=', today);
    const row = instrument
      ? await q.where('instrument', '=', instrument).executeTakeFirst()
      : await q.executeTakeFirst();
    todayXpForSurfaceInstrument = Number(row?.total ?? 0);
  }

  return {
    today,
    weekStart,
    isFirstLessonPlay,
    starsRaisedOnRetry,
    weeklyMasteryBonusForLesson,
    todayXpForSurfaceInstrument,
    bpmMilestoneAlreadyHit,
    alreadyPlayedSongToday,
  };
}

function computeInstrumentForEvent(event: ProgressEvent): Instrument | null {
  switch (event.kind) {
    case 'lesson_completed':
      return event.instrument;
    case 'rudiment_practiced':
    case 'fill_practiced':
      return 'drums';
    case 'ear_session_finished':
    case 'fretboard_session_finished':
    case 'repertoire_review':
      return 'guitar';
    default:
      return null;
  }
}

async function resolveInstrumentForEvent(
  trx: Transaction<DB>,
  event: ProgressEvent,
): Promise<Instrument | null> {
  const direct = computeInstrumentForEvent(event);
  if (direct) return direct;
  if (event.kind === 'program_goal_completed') {
    const row = await trx
      .selectFrom('practice_programs')
      .select('instrument')
      .where('id', '=', event.programId)
      .executeTakeFirst();
    const i = (row?.instrument ?? null) as Instrument | null;
    if (i === 'guitar' || i === 'drums' || i === 'theory') return i;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Step 2: ledger insert (idempotent)
// ---------------------------------------------------------------------------------------------

async function insertLedgerRow(
  trx: Transaction<DB>,
  row: {
    amount: number;
    source: string;
    instrument: string | null;
    lesson_id: string | null;
    earned_at: string;
    surface: string;
    ref_id: string | null;
    dedupe_key: string;
  },
): Promise<boolean> {
  const result = await trx
    .insertInto('learn_xp_ledger')
    .values(row)
    .onConflict(oc => oc.column('dedupe_key').doNothing())
    .executeTakeFirst();
  // Kysely returns the rowid only when an insert lands.
  return Number(result?.numInsertedOrUpdatedRows ?? 0) > 0;
}

/**
 * Maps the new `surface` discriminator onto the legacy `source` column for backward compatibility
 * with code paths that still read `source`. New rows always set both. Lessons split into
 * 'lesson' and 'heart_bonus' depending on the dedupe-key intent (first-play vs heart bonus).
 */
function legacySourceForSurface(
  surface: Surface,
  isFirstLessonPlay: boolean,
  event: ProgressEvent,
): string {
  if (surface === 'lesson') {
    // First-play rows still use 'lesson'; the +3 hearts bonus is no longer split into a separate
    // ledger row (it's bundled in the first-play XP via xp.ts) — see plan §C.
    return isFirstLessonPlay ? 'lesson' : 'lesson_mastery_bonus';
  }
  if (surface === 'mission_bonus') return 'mission_bonus';
  if (surface === 'achievement_bonus') return 'achievement_bonus';
  // For all other surfaces the source mirrors the surface for clarity.
  return surface;
}

// ---------------------------------------------------------------------------------------------
// Step 3: lesson stars (upgrade-only)
// ---------------------------------------------------------------------------------------------

async function upgradeLessonStarsForLesson(
  trx: Transaction<DB>,
  event: Extract<ProgressEvent, {kind: 'lesson_completed'}>,
  nowIso: string,
): Promise<{stars: Stars; raisedFrom: number | null}> {
  const computed = computeLessonStars({heartsLost: event.heartsLost, accuracy: event.accuracy});
  const existing = await trx
    .selectFrom('lesson_stars')
    .selectAll()
    .where('instrument', '=', event.instrument)
    .where('unit_id', '=', event.unitId)
    .where('lesson_id', '=', event.lessonId)
    .executeTakeFirst();

  if (!existing) {
    await trx
      .insertInto('lesson_stars')
      .values({
        instrument: event.instrument,
        unit_id: event.unitId,
        lesson_id: event.lessonId,
        stars: computed,
        best_hearts_remaining: Math.max(0, 3 - event.heartsLost),
        best_accuracy: event.accuracy,
        first_try: event.heartsLost === 0 && event.accuracy >= 0.85 ? 1 : 0,
        attempts: 1,
        last_completed_at: nowIso,
      })
      .execute();
    return {stars: computed, raisedFrom: null};
  }

  const previousStars = (existing.stars as Stars) ?? 1;
  const newStars = upgradeStars(previousStars, computed);
  await trx
    .updateTable('lesson_stars')
    .set({
      stars: newStars,
      best_hearts_remaining: Math.max(existing.best_hearts_remaining, 3 - event.heartsLost),
      best_accuracy: Math.max(existing.best_accuracy, event.accuracy),
      attempts: existing.attempts + 1,
      last_completed_at: nowIso,
    })
    .where('id', '=', existing.id)
    .execute();
  return {stars: newStars, raisedFrom: previousStars};
}

// ---------------------------------------------------------------------------------------------
// Step 4: levels
// ---------------------------------------------------------------------------------------------

async function applyXpToInstrumentLevels(
  trx: Transaction<DB>,
  instrument: Instrument,
  xp: number,
  nowIso: string,
): Promise<{leveledUp: boolean; newLevel?: number}> {
  const row = await trx
    .selectFrom('instrument_levels')
    .selectAll()
    .where('instrument', '=', instrument)
    .executeTakeFirst();
  const prev = {cum_xp: row?.cum_xp ?? 0, level: row?.level ?? 1};
  const delta = applyXpToLevels(prev, xp);

  if (!row) {
    await trx
      .insertInto('instrument_levels')
      .values({
        instrument,
        cum_xp: delta.cum_xp,
        level: delta.level,
        xp_into_level: delta.xp_into_level,
        xp_to_next: delta.xp_to_next,
        updated_at: nowIso,
      })
      .execute();
  } else {
    await trx
      .updateTable('instrument_levels')
      .set({
        cum_xp: delta.cum_xp,
        level: delta.level,
        xp_into_level: delta.xp_into_level,
        xp_to_next: delta.xp_to_next,
        updated_at: nowIso,
      })
      .where('instrument', '=', instrument)
      .execute();
  }
  return {leveledUp: delta.leveledUp, newLevel: delta.newLevel};
}

// ---------------------------------------------------------------------------------------------
// Step 5: streak + daily goal sync (port of legacy syncStreakAfterXp)
// ---------------------------------------------------------------------------------------------

async function syncStreakAndDailyGoal(
  trx: Transaction<DB>,
  today: string,
): Promise<{dailyGoalMet: boolean; newStreak: number; todayXp: number; dailyGoalTarget: number}> {
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

  const streakRow = await trx.selectFrom('learn_streaks').selectAll().executeTakeFirst();
  const dailyGoalTarget: number = streakRow?.daily_goal_target ?? DEFAULT_DAILY_GOAL_XP;

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

  return {
    dailyGoalMet: goalRow?.completed === 1 || goalJustMet,
    newStreak,
    todayXp,
    dailyGoalTarget,
  };
}

async function getDailyGoalCompleted(trx: Transaction<DB>, today: string): Promise<boolean> {
  const row = await trx
    .selectFrom('learn_daily_goal')
    .select('completed')
    .where('date', '=', today)
    .executeTakeFirst();
  return row?.completed === 1;
}

// ---------------------------------------------------------------------------------------------
// Step 6: missions
// ---------------------------------------------------------------------------------------------

interface MissionRunResult {
  advanced: {id: string; progress: number; target: number}[];
  completed: string[];
  bonusXp: number;
}

async function advanceActiveMissions(
  trx: Transaction<DB>,
  event: ProgressEvent,
  weekStart: string,
  nowIso: string,
  ctx: MissionEventContext,
): Promise<MissionRunResult> {
  const active = await trx
    .selectFrom('active_missions')
    .selectAll()
    .where('week_start', '=', weekStart)
    .where('state', '=', 'active')
    .execute();

  const advanced: MissionRunResult['advanced'] = [];
  const completed: string[] = [];
  let bonusXp = 0;

  for (const row of active) {
    const template = findMissionTemplate(row.template_id);
    if (!template) continue;

    let newProgress = row.progress;
    const absolute = absoluteProgressForEvent(template, event, ctx);
    if (absolute != null) {
      newProgress = Math.max(row.progress, absolute);
    } else {
      newProgress = row.progress + progressDeltaForEvent(template, event, ctx);
    }
    if (newProgress === row.progress) continue;

    const justCompleted = newProgress >= row.target && row.state === 'active';
    if (justCompleted) {
      await trx
        .updateTable('active_missions')
        .set({progress: newProgress, state: 'completed', completed_at: nowIso})
        .where('id', '=', row.id)
        .execute();
      completed.push(template.id);
      bonusXp += template.xp_reward;
      await insertLedgerRow(trx, {
        amount: template.xp_reward,
        source: 'mission_bonus',
        instrument: null,
        lesson_id: null,
        earned_at: nowIso,
        surface: 'mission_bonus',
        ref_id: template.id,
        dedupe_key: `mission_bonus:${template.id}:${weekStart}`,
      });
    } else {
      await trx
        .updateTable('active_missions')
        .set({progress: newProgress})
        .where('id', '=', row.id)
        .execute();
    }
    advanced.push({id: template.id, progress: newProgress, target: row.target});
  }
  return {advanced, completed, bonusXp};
}

async function getWeeklyDistinctSurfaces(
  trx: Transaction<DB>,
  weekStart: string,
): Promise<Set<Surface>> {
  const rows = await trx
    .selectFrom('learn_xp_ledger')
    .select('surface')
    .where('earned_at', '>=', weekStart)
    .where('surface', 'is not', null)
    .distinct()
    .execute();
  return new Set(
    rows.map(r => r.surface as Surface).filter(s => s !== 'mission_bonus' && s !== 'achievement_bonus'),
  );
}

// ---------------------------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------------------------

/** Returns the Monday of the ISO week containing `dateIso`, in YYYY-MM-DD local form. */
export function mondayOfWeek(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0 Sun, 1 Mon, ..., 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('sv'); // YYYY-MM-DD local
}
