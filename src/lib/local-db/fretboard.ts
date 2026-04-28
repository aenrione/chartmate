import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';
import {sql} from 'kysely';
import {calculateSM2, todayISO} from '../repertoire/sm2';
import type {ReviewQuality} from '../repertoire/sm2';

// ── Types ────────────────────────────────────────────────────────────────────

export type AttemptStatus = 'correct' | 'incorrect' | 'skipped';

export type DrillType =
  | 'note-finder'
  | 'interval-spotter'
  | 'scale-navigator'
  | 'chord-tone-finder'
  | 'octave-mapper'
  | 'caged-shapes';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface FretboardSession {
  id: number;
  drillType: DrillType;
  difficulty: Difficulty;
  totalQuestions: number;
  correctAnswers: number;
  durationMs: number;
  xpEarned: number;
  createdAt: string;
}

export interface FretboardAttempt {
  id: number;
  sessionId: number;
  drillType: DrillType;
  stringIndex: number;
  fret: number;
  expectedAnswer: string;
  givenAnswer: string | null;
  status: AttemptStatus;
  responseTimeMs: number;
  createdAt: string;
}

export interface PositionStats {
  stringIndex: number;
  fret: number;
  drillType: DrillType;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  avgResponseMs: number;
  lastPracticedAt: string | null;
}

export interface UserStats {
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate: string | null;
  totalXp: number;
  totalDrillsCompleted: number;
  overallAccuracy: number;
}

export interface FretboardCard {
  id: number;
  stringIndex: number;
  fret: number;
  direction: 'pos_to_note' | 'note_to_pos';
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: string;
  lastReviewedAt: string | null;
  createdAt: string;
}

// ── Session Functions ────────────────────────────────────────────────────────

export async function createFretboardSession(params: {
  drillType: DrillType;
  difficulty: Difficulty;
  totalQuestions: number;
  correctAnswers: number;
  durationMs: number;
  xpEarned: number;
}): Promise<number> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  const result = await db
    .insertInto('fretboard_sessions')
    .values({
      drill_type: params.drillType,
      difficulty: params.difficulty,
      total_questions: params.totalQuestions,
      correct_answers: params.correctAnswers,
      duration_ms: params.durationMs,
      xp_earned: params.xpEarned,
      created_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function getFretboardSessions(
  drillType?: DrillType,
  limit = 50,
): Promise<FretboardSession[]> {
  const db = await getLocalDb();
  let query = db
    .selectFrom('fretboard_sessions')
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(limit);

  if (drillType) {
    query = query.where('drill_type', '=', drillType);
  }

  const rows = await query.execute();
  return rows.map(r => ({
    id: r.id,
    drillType: r.drill_type as DrillType,
    difficulty: r.difficulty as Difficulty,
    totalQuestions: r.total_questions,
    correctAnswers: r.correct_answers,
    durationMs: r.duration_ms,
    xpEarned: r.xp_earned,
    createdAt: r.created_at,
  }));
}

export async function getBestSession(drillType: DrillType): Promise<FretboardSession | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('fretboard_sessions')
    .selectAll()
    .where('drill_type', '=', drillType)
    .orderBy(sql`CAST(correct_answers AS REAL) / total_questions`, 'desc')
    .limit(1)
    .executeTakeFirst();

  if (!row) return null;
  return {
    id: row.id,
    drillType: row.drill_type as DrillType,
    difficulty: row.difficulty as Difficulty,
    totalQuestions: row.total_questions,
    correctAnswers: row.correct_answers,
    durationMs: row.duration_ms,
    xpEarned: row.xp_earned,
    createdAt: row.created_at,
  };
}

// ── Attempt Functions ────────────────────────────────────────────────────────

export async function saveAttempts(
  sessionId: number,
  attempts: Array<{
    drillType: DrillType;
    stringIndex: number;
    fret: number;
    expectedAnswer: string;
    givenAnswer: string | null;
    status: AttemptStatus;
    responseTimeMs: number;
  }>,
): Promise<void> {
  if (attempts.length === 0) return;
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  await db
    .insertInto('fretboard_attempts')
    .values(
      attempts.map(a => ({
        session_id: sessionId,
        drill_type: a.drillType,
        string_index: a.stringIndex,
        fret: a.fret,
        expected_answer: a.expectedAnswer,
        given_answer: a.givenAnswer,
        status: a.status,
        response_time_ms: a.responseTimeMs,
        created_at: now,
      })),
    )
    .execute();
}

// ── Stats Functions (derived from attempts) ──────────────────────────────────

export async function getPositionStats(drillType?: DrillType): Promise<PositionStats[]> {
  const db = await getLocalDb();
  let query = db
    .selectFrom('fretboard_attempts')
    .select([
      'string_index',
      'fret',
      'drill_type',
      db.fn.count<number>('id').as('total_attempts'),
      sql<number>`SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END)`.as('correct_attempts'),
      db.fn.avg<number>('response_time_ms').as('avg_response_ms'),
      db.fn.max<string>('created_at').as('last_practiced_at'),
    ])
    .groupBy(['string_index', 'fret', 'drill_type']);

  if (drillType) {
    query = query.where('drill_type', '=', drillType);
  }

  const rows = await query.execute();
  return rows.map(r => ({
    stringIndex: r.string_index,
    fret: r.fret,
    drillType: r.drill_type as DrillType,
    totalAttempts: r.total_attempts,
    correctAttempts: r.correct_attempts,
    accuracy: r.total_attempts > 0 ? r.correct_attempts / r.total_attempts : 0,
    avgResponseMs: Math.round(r.avg_response_ms ?? 0),
    lastPracticedAt: r.last_practiced_at,
  }));
}

function calculateStreaks(dates: string[]): {currentStreak: number; longestStreak: number} {
  if (dates.length === 0) return {currentStreak: 0, longestStreak: 0};

  const today = getCurrentTimestamp().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const lastDate = dates[0];

  let currentStreak = 0;
  if (lastDate === today || lastDate === yesterday) {
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const diffDays =
        (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / 86400000;
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
    currentStreak = streak;
  }

  let longestStreak = 0;
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diffDays =
      (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / 86400000;
    if (diffDays === 1) {
      streak++;
    } else {
      longestStreak = Math.max(longestStreak, streak);
      streak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, streak);

  return {currentStreak, longestStreak: Math.max(longestStreak, currentStreak)};
}

export async function getUserStats(): Promise<UserStats> {
  const db = await getLocalDb();

  const sessions = await db
    .selectFrom('fretboard_sessions')
    .select([
      db.fn.count<number>('id').as('total_drills'),
      db.fn.sum<number>('xp_earned').as('total_xp'),
      db.fn.sum<number>('correct_answers').as('total_correct'),
      db.fn.sum<number>('total_questions').as('total_questions'),
    ])
    .executeTakeFirst();

  // Calculate streak from session dates
  const dates = await db
    .selectFrom('fretboard_sessions')
    .select(sql<string>`DATE(created_at)`.as('practice_date'))
    .groupBy('practice_date')
    .orderBy('practice_date', 'desc')
    .execute();

  const lastDate = dates.length > 0 ? (dates[0].practice_date as string) : null;
  const dateStrings = dates.map(d => d.practice_date as string);
  const {currentStreak, longestStreak} = calculateStreaks(dateStrings);

  const totalQuestions = sessions?.total_questions ?? 0;
  const totalCorrect = sessions?.total_correct ?? 0;

  return {
    currentStreak,
    longestStreak,
    lastPracticeDate: lastDate,
    totalXp: sessions?.total_xp ?? 0,
    totalDrillsCompleted: sessions?.total_drills ?? 0,
    overallAccuracy: totalQuestions > 0 ? totalCorrect / totalQuestions : 0,
  };
}

// ── Anki Card Functions ──────────────────────────────────────────────────────

const SEED_ORDER: Array<{stringIndex: number; fret: number}> = [
  // Low E (string 0), landmark frets first
  {stringIndex: 0, fret: 0},
  {stringIndex: 0, fret: 1},
  {stringIndex: 0, fret: 3},
  {stringIndex: 0, fret: 5},
  {stringIndex: 0, fret: 7},
  {stringIndex: 0, fret: 8},
  {stringIndex: 0, fret: 10},
  {stringIndex: 0, fret: 12},
  // Low E, chromatic fill
  {stringIndex: 0, fret: 2},
  {stringIndex: 0, fret: 4},
  {stringIndex: 0, fret: 6},
  {stringIndex: 0, fret: 9},
  {stringIndex: 0, fret: 11},
  // Strings 1-5 (A, D, G, B, high E), frets 0-12
  ...[1, 2, 3, 4, 5].flatMap(s =>
    Array.from({length: 13}, (_, f) => ({stringIndex: s, fret: f}))
  ),
];

export async function seedAnkiCards(): Promise<void> {
  const db = await getLocalDb();
  const today = todayISO();
  const now = getCurrentTimestamp();
  const rows = SEED_ORDER.flatMap(({stringIndex, fret}) => [
    {
      string_index: stringIndex,
      fret,
      direction: 'pos_to_note' as const,
      interval: 0,
      ease_factor: 2.5,
      repetitions: 0,
      next_review_date: today,
      last_reviewed_at: null,
      created_at: now,
    },
    {
      string_index: stringIndex,
      fret,
      direction: 'note_to_pos' as const,
      interval: 0,
      ease_factor: 2.5,
      repetitions: 0,
      next_review_date: today,
      last_reviewed_at: null,
      created_at: now,
    },
  ]);

  await db.transaction().execute(async trx => {
    for (const row of rows) {
      await trx
        .insertInto('fretboard_cards')
        .values(row)
        .onConflict(oc => oc.columns(['string_index', 'fret', 'direction']).doNothing())
        .execute();
    }
  });
}

export async function getAnkiDueCards(limit = 200): Promise<FretboardCard[]> {
  const db = await getLocalDb();
  const today = todayISO();

  const rows = await db
    .selectFrom('fretboard_cards')
    .selectAll()
    .where('next_review_date', '<=', today)
    .orderBy('repetitions', 'asc')
    .orderBy('next_review_date', 'asc')
    .limit(limit)
    .execute();

  return rows.map(r => ({
    id: r.id,
    stringIndex: r.string_index,
    fret: r.fret,
    direction: r.direction as 'pos_to_note' | 'note_to_pos',
    interval: r.interval,
    easeFactor: r.ease_factor,
    repetitions: r.repetitions,
    nextReviewDate: r.next_review_date,
    lastReviewedAt: r.last_reviewed_at,
    createdAt: r.created_at,
  }));
}

export async function updateAnkiCard(id: number, quality: ReviewQuality): Promise<void> {
  const db = await getLocalDb();

  const row = await db
    .selectFrom('fretboard_cards')
    .select(['repetitions', 'ease_factor', 'interval'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();

  const {newInterval, newEaseFactor, newRepetitions, nextReviewDate} = calculateSM2(
    quality,
    row.repetitions,
    row.ease_factor,
    row.interval,
  );

  await db
    .updateTable('fretboard_cards')
    .set({
      interval: newInterval,
      ease_factor: newEaseFactor,
      repetitions: newRepetitions,
      next_review_date: nextReviewDate,
      last_reviewed_at: getCurrentTimestamp(),
    })
    .where('id', '=', id)
    .execute();
}

export async function getAnkiDueCount(): Promise<number> {
  const db = await getLocalDb();
  const today = todayISO();

  const result = await db
    .selectFrom('fretboard_cards')
    .select(db.fn.count<number>('id').as('count'))
    .where('next_review_date', '<=', today)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}
