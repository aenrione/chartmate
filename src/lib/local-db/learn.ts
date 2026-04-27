// src/lib/local-db/learn.ts
import {getLocalDb} from './client';

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
