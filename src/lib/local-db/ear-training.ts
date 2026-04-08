import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';
import {sql} from 'kysely';

// ── Types ────────────────────────────────────────────────────────────────────

export type EarExerciseType =
  | 'interval-recognition'
  | 'chord-recognition'
  | 'perfect-pitch'
  | 'scale-recognition'
  | 'scale-degrees'
  | 'chord-progressions'
  | 'intervals-in-context'
  | 'melodic-dictation';

export type EarDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type EarAttemptStatus = 'correct' | 'incorrect' | 'skipped';
export type PlaybackMode = 'melodic' | 'harmonic';
export type Direction = 'ascending' | 'descending' | 'both';
export type Speed = 'slow' | 'medium' | 'fast';

export interface EarSession {
  id: number;
  exerciseType: EarExerciseType;
  difficulty: EarDifficulty;
  totalQuestions: number;
  correctAnswers: number;
  skippedCount: number;
  durationMs: number;
  xpEarned: number;
  playbackMode: PlaybackMode;
  direction: Direction;
  speed: Speed;
  createdAt: string;
}

export interface EarAttemptRecord {
  id: number;
  sessionId: number;
  exerciseType: EarExerciseType;
  promptItem: string;
  answerContext: string | null;
  expectedAnswer: string;
  givenAnswer: string | null;
  status: EarAttemptStatus;
  responseTimeMs: number;
  createdAt: string;
}

export interface EarItemStats {
  exerciseType: EarExerciseType;
  promptItem: string;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  avgResponseMs: number;
  lastPracticedAt: string | null;
}

export interface EarUserStats {
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate: string | null;
  totalXp: number;
  totalSessionsCompleted: number;
  overallAccuracy: number;
}

// ── Session Functions ────────────────────────────────────────────────────────

export async function createEarSession(params: {
  exerciseType: EarExerciseType;
  difficulty: EarDifficulty;
  totalQuestions: number;
  correctAnswers: number;
  skippedCount: number;
  durationMs: number;
  xpEarned: number;
  playbackMode: PlaybackMode;
  direction: Direction;
  speed: Speed;
}): Promise<number> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  const result = await db
    .insertInto('ear_sessions')
    .values({
      exercise_type: params.exerciseType,
      difficulty: params.difficulty,
      total_questions: params.totalQuestions,
      correct_answers: params.correctAnswers,
      skipped_count: params.skippedCount,
      duration_ms: params.durationMs,
      xp_earned: params.xpEarned,
      playback_mode: params.playbackMode,
      direction: params.direction,
      speed: params.speed,
      created_at: now,
    })
    .executeTakeFirstOrThrow();
  return Number(result.insertId);
}

export async function saveEarAttempts(
  sessionId: number,
  attempts: Array<{
    exerciseType: EarExerciseType;
    promptItem: string;
    answerContext: string | null;
    expectedAnswer: string;
    givenAnswer: string | null;
    status: EarAttemptStatus;
    responseTimeMs: number;
  }>,
): Promise<void> {
  if (attempts.length === 0) return;
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  await db
    .insertInto('ear_attempts')
    .values(
      attempts.map(a => ({
        session_id: sessionId,
        exercise_type: a.exerciseType,
        prompt_item: a.promptItem,
        answer_context: a.answerContext,
        expected_answer: a.expectedAnswer,
        given_answer: a.givenAnswer,
        status: a.status,
        response_time_ms: a.responseTimeMs,
        created_at: now,
      })),
    )
    .execute();
}

export async function getEarUserStats(): Promise<EarUserStats> {
  const db = await getLocalDb();

  const sessions = await db
    .selectFrom('ear_sessions')
    .select(['created_at', 'correct_answers', 'total_questions', 'xp_earned'])
    .orderBy('created_at', 'asc')
    .execute();

  if (sessions.length === 0) {
    return {
      currentStreak: 0, longestStreak: 0, lastPracticeDate: null,
      totalXp: 0, totalSessionsCompleted: 0, overallAccuracy: 0,
    };
  }

  const totalXp = sessions.reduce((sum, s) => sum + s.xp_earned, 0);
  const totalCorrect = sessions.reduce((sum, s) => sum + s.correct_answers, 0);
  const totalQuestions = sessions.reduce((sum, s) => sum + s.total_questions, 0);
  const overallAccuracy = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;

  // streak: count consecutive days with at least one session
  const dates = [...new Set(sessions.map(s => s.created_at.split('T')[0]))].sort();
  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 1;
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
    if (diffDays === 1) {
      streak++;
    } else {
      longestStreak = Math.max(longestStreak, streak);
      streak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, streak);

  const lastDate = dates[dates.length - 1];
  currentStreak = (lastDate === today || lastDate === yesterday) ? streak : 0;

  return {
    currentStreak,
    longestStreak,
    lastPracticeDate: lastDate ?? null,
    totalXp,
    totalSessionsCompleted: sessions.length,
    overallAccuracy,
  };
}

export async function getEarItemStats(
  exerciseType?: EarExerciseType,
): Promise<EarItemStats[]> {
  const db = await getLocalDb();
  let query = db
    .selectFrom('ear_attempts')
    .select([
      'exercise_type',
      'prompt_item',
      sql<number>`COUNT(*)`.as('total_attempts'),
      sql<number>`SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END)`.as('correct_attempts'),
      sql<number>`AVG(response_time_ms)`.as('avg_response_ms'),
      sql<string>`MAX(created_at)`.as('last_practiced_at'),
    ])
    .groupBy(['exercise_type', 'prompt_item']);

  if (exerciseType) {
    query = query.where('exercise_type', '=', exerciseType) as typeof query;
  }

  const rows = await query.execute();
  return rows.map(r => ({
    exerciseType: r.exercise_type as EarExerciseType,
    promptItem: r.prompt_item,
    totalAttempts: Number(r.total_attempts),
    correctAttempts: Number(r.correct_attempts),
    accuracy: Number(r.total_attempts) > 0 ? Number(r.correct_attempts) / Number(r.total_attempts) : 0,
    avgResponseMs: Number(r.avg_response_ms),
    lastPracticedAt: r.last_practiced_at,
  }));
}

export async function getBestEarSession(exerciseType: EarExerciseType): Promise<EarSession | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('ear_sessions')
    .selectAll()
    .where('exercise_type', '=', exerciseType)
    .where('total_questions', '>', 0)
    .orderBy(
      sql`CAST(correct_answers AS REAL) / CAST(total_questions AS REAL)`,
      'desc',
    )
    .limit(1)
    .executeTakeFirst();

  if (!row) return null;
  return {
    id: row.id,
    exerciseType: row.exercise_type as EarExerciseType,
    difficulty: row.difficulty as EarDifficulty,
    totalQuestions: row.total_questions,
    correctAnswers: row.correct_answers,
    skippedCount: row.skipped_count,
    durationMs: row.duration_ms,
    xpEarned: row.xp_earned,
    playbackMode: row.playback_mode as PlaybackMode,
    direction: row.direction as Direction,
    speed: row.speed as Speed,
    createdAt: row.created_at,
  };
}
