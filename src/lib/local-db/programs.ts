import {getLocalDb} from './client';
import type {DB} from './types';
import type {Kysely} from 'kysely';

// ── Domain types ──────────────────────────────────────────────────────────────

export interface Program {
  id: number;
  title: string;
  description: string | null;
  instrument: string | null;
  status: 'draft' | 'active' | 'archived';
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: number;
  programId: number;
  title: string;
  description: string | null;
  orderIndex: number;
  suggestedDays: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Goal {
  id: number;
  unitId: number;
  title: string;
  type: 'song' | 'tab' | 'learn_lesson' | 'exercise' | 'custom';
  refId: string | null;
  target: string | null;
  notes: string | null;
  orderIndex: number;
  completedAt: string | null;
  createdAt: string;
}

export interface Session {
  id: number;
  title: string | null;
  unitId: number | null;
  scheduledDate: string;
  scheduledTime: string | null;
  durationMinutes: number | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function rowToProgram(row: any): Program {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    instrument: row.instrument,
    status: row.status as Program['status'],
    startedAt: row.started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUnit(row: any): Unit {
  return {
    id: row.id,
    programId: row.program_id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
    suggestedDays: row.suggested_days,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function rowToGoal(row: any): Goal {
  return {
    id: row.id,
    unitId: row.unit_id,
    title: row.title,
    type: row.type as Goal['type'],
    refId: row.ref_id,
    target: row.target,
    notes: row.notes,
    orderIndex: row.order_index,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function rowToSession(row: any): Session {
  return {
    id: row.id,
    title: row.title,
    unitId: row.unit_id,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    durationMinutes: row.duration_minutes,
    completedAt: row.completed_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// ── Programs ──────────────────────────────────────────────────────────────────

export async function getPrograms(): Promise<Program[]> {
  const db = await getLocalDb();
  const rows = await db.selectFrom('practice_programs').selectAll().execute();
  return rows.map(rowToProgram);
}

export async function getActiveProgram(): Promise<Program | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('practice_programs')
    .selectAll()
    .where('status', '=', 'active')
    .executeTakeFirst();
  return row ? rowToProgram(row) : null;
}

export async function getProgram(id: number): Promise<Program | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('practice_programs')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row ? rowToProgram(row) : null;
}

export async function createProgram(data: {
  title: string;
  description?: string;
  instrument?: string;
}): Promise<number> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const result = await db
    .insertInto('practice_programs')
    .values({
      title: data.title,
      description: data.description ?? null,
      instrument: data.instrument ?? null,
      status: 'draft',
      started_at: null,
      created_at: now,
      updated_at: now,
    })
    .executeTakeFirst();
  return Number(result?.insertId ?? 0);
}

export async function updateProgram(
  id: number,
  data: Partial<{title: string; description: string; instrument: string}>,
): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await db
    .updateTable('practice_programs')
    .set({...data, updated_at: now})
    .where('id', '=', id)
    .execute();
}

export async function activateProgram(id: number): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  // Deactivate any currently active program (only one active at a time)
  await db
    .updateTable('practice_programs')
    .set({status: 'draft', updated_at: now})
    .where('status', '=', 'active')
    .execute();
  await db
    .updateTable('practice_programs')
    .set({status: 'active', started_at: now, updated_at: now})
    .where('id', '=', id)
    .execute();
}

export async function archiveProgram(id: number): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await db
    .updateTable('practice_programs')
    .set({status: 'archived', updated_at: now})
    .where('id', '=', id)
    .execute();
}

// ── Units ─────────────────────────────────────────────────────────────────────

export async function getUnitsForProgram(programId: number): Promise<Unit[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('program_units')
    .selectAll()
    .where('program_id', '=', programId)
    .orderBy('order_index', 'asc')
    .execute();
  return rows.map(rowToUnit);
}

export async function getUnit(id: number): Promise<Unit | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('program_units')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row ? rowToUnit(row) : null;
}

export async function createUnit(data: {
  programId: number;
  title: string;
  description?: string;
  suggestedDays?: number;
}): Promise<number> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const last = await db
    .selectFrom('program_units')
    .select('order_index')
    .where('program_id', '=', data.programId)
    .orderBy('order_index', 'desc')
    .limit(1)
    .executeTakeFirst();
  const orderIndex = last ? (last.order_index as number) + 1 : 0;
  const result = await db
    .insertInto('program_units')
    .values({
      program_id: data.programId,
      title: data.title,
      description: data.description ?? null,
      order_index: orderIndex,
      suggested_days: data.suggestedDays ?? null,
      started_at: null,
      completed_at: null,
      created_at: now,
    })
    .executeTakeFirst();
  return Number(result?.insertId ?? 0);
}

export async function updateUnit(
  id: number,
  data: Partial<{title: string; description: string; suggestedDays: number}>,
): Promise<void> {
  const db = await getLocalDb();
  const mapped: Record<string, unknown> = {};
  if (data.title !== undefined) mapped.title = data.title;
  if (data.description !== undefined) mapped.description = data.description;
  if (data.suggestedDays !== undefined) mapped.suggested_days = data.suggestedDays;
  await db.updateTable('program_units').set(mapped).where('id', '=', id).execute();
}

export async function startUnit(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('program_units')
    .set({started_at: new Date().toISOString()})
    .where('id', '=', id)
    .execute();
}

export async function completeUnit(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('program_units')
    .set({completed_at: new Date().toISOString()})
    .where('id', '=', id)
    .execute();
}

export async function deleteUnit(id: number): Promise<void> {
  const db = await getLocalDb();
  await (db as any).deleteFrom('program_units').where('id', '=', id).execute();
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export async function getGoalsForUnit(unitId: number): Promise<Goal[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('unit_goals')
    .selectAll()
    .where('unit_id', '=', unitId)
    .orderBy('order_index', 'asc')
    .execute();
  return rows.map(rowToGoal);
}

export async function createGoal(data: {
  unitId: number;
  title: string;
  type?: Goal['type'];
  refId?: string;
  target?: string;
  notes?: string;
}): Promise<number> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const last = await db
    .selectFrom('unit_goals')
    .select('order_index')
    .where('unit_id', '=', data.unitId)
    .orderBy('order_index', 'desc')
    .limit(1)
    .executeTakeFirst();
  const orderIndex = last ? (last.order_index as number) + 1 : 0;
  const result = await db
    .insertInto('unit_goals')
    .values({
      unit_id: data.unitId,
      title: data.title,
      type: data.type ?? 'custom',
      ref_id: data.refId ?? null,
      target: data.target ?? null,
      notes: data.notes ?? null,
      order_index: orderIndex,
      completed_at: null,
      created_at: now,
    })
    .executeTakeFirst();
  return Number(result?.insertId ?? 0);
}

export async function updateGoal(
  id: number,
  data: Partial<{title: string; target: string | null; notes: string | null}>,
): Promise<void> {
  const db = await getLocalDb();
  await db.updateTable('unit_goals').set(data).where('id', '=', id).execute();
}

export async function completeGoal(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('unit_goals')
    .set({completed_at: new Date().toISOString()})
    .where('id', '=', id)
    .execute();
}

export async function uncompleteGoal(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('unit_goals')
    .set({completed_at: null})
    .where('id', '=', id)
    .execute();
}

export async function deleteGoal(id: number): Promise<void> {
  const db = await getLocalDb();
  await (db as any).deleteFrom('unit_goals').where('id', '=', id).execute();
}

// ── Sessions ──────────────────────────────────────────────────────────────────
// NOTE: Table is 'lesson_sessions' (not 'practice_sessions' — that's the playbook table)

export async function getSessionsForDateRange(from: string, to: string): Promise<Session[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('lesson_sessions')
    .selectAll()
    .where('scheduled_date', '>=', from)
    .where('scheduled_date', '<=', to)
    .orderBy('scheduled_date', 'asc')
    .execute();
  return rows.map(rowToSession);
}

export async function getSessionsForDate(date: string): Promise<Session[]> {
  return getSessionsForDateRange(date, date);
}

export async function getUpcomingSessions(limit = 5): Promise<Session[]> {
  const db = await getLocalDb();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .selectFrom('lesson_sessions')
    .selectAll()
    .where('scheduled_date', '>=', today)
    .orderBy('scheduled_date', 'asc')
    .limit(limit)
    .execute();
  return rows.map(rowToSession);
}

export async function createSession(data: {
  title?: string;
  unitId?: number;
  scheduledDate: string;
  scheduledTime?: string;
  durationMinutes?: number;
}): Promise<number> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const result = await db
    .insertInto('lesson_sessions')
    .values({
      title: data.title ?? null,
      unit_id: data.unitId ?? null,
      scheduled_date: data.scheduledDate,
      scheduled_time: data.scheduledTime ?? null,
      duration_minutes: data.durationMinutes ?? null,
      completed_at: null,
      notes: null,
      created_at: now,
    })
    .executeTakeFirst();
  return Number(result?.insertId ?? 0);
}

export async function updateSession(
  id: number,
  data: Partial<{
    title: string | null;
    unitId: number | null;
    scheduledDate: string;
    scheduledTime: string | null;
    durationMinutes: number | null;
  }>,
): Promise<void> {
  const db = await getLocalDb();
  const mapped: Record<string, unknown> = {};
  if ('title' in data) mapped.title = data.title;
  if ('unitId' in data) mapped.unit_id = data.unitId;
  if (data.scheduledDate !== undefined) mapped.scheduled_date = data.scheduledDate;
  if ('scheduledTime' in data) mapped.scheduled_time = data.scheduledTime;
  if ('durationMinutes' in data) mapped.duration_minutes = data.durationMinutes;
  await db.updateTable('lesson_sessions').set(mapped).where('id', '=', id).execute();
}

export async function completeSession(id: number, notes?: string): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('lesson_sessions')
    .set({completed_at: new Date().toISOString(), notes: notes ?? null})
    .where('id', '=', id)
    .execute();
}

export async function deleteSession(id: number): Promise<void> {
  const db = await getLocalDb();
  await (db as any).deleteFrom('lesson_sessions').where('id', '=', id).execute();
}
