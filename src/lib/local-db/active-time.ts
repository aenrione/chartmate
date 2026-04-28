import {sql} from 'kysely';
import {getLocalDb} from './client';

export type ActivityContext =
  | 'browse'
  | 'lesson'
  | 'drill'
  | 'ear'
  | 'repertoire'
  | 'fill'
  | 'rudiment'
  | 'tab_editor'
  | 'playbook';

export async function openSession(context: ActivityContext): Promise<number> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const result = await db
    .insertInto('app_sessions')
    .values({started_at: now, ended_at: null, duration_ms: 0, context})
    .executeTakeFirstOrThrow();
  return Number(result.insertId);
}

export async function addHeartbeat(sessionId: number, deltaMs: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('app_sessions')
    .set({duration_ms: sql`duration_ms + ${deltaMs}`})
    .where('id', '=', sessionId)
    .execute();
}

export async function closeSession(sessionId: number, finalDeltaMs = 0): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await db
    .updateTable('app_sessions')
    .set({
      ended_at: now,
      duration_ms: finalDeltaMs > 0 ? sql`duration_ms + ${finalDeltaMs}` : sql`duration_ms`,
    })
    .where('id', '=', sessionId)
    .where('ended_at', 'is', null)
    .execute();
}

export async function getDailyActiveMs(date: string): Promise<number> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('app_sessions')
    .select(sql<number>`COALESCE(SUM(duration_ms), 0)`.as('total'))
    .where(sql`date(started_at)`, '=', date)
    .executeTakeFirst();
  return row?.total ?? 0;
}

export interface ContextBreakdown {
  context: string;
  total_ms: number;
}

export async function getDailyBreakdown(date: string): Promise<ContextBreakdown[]> {
  const db = await getLocalDb();
  return db
    .selectFrom('app_sessions')
    .select(['context', sql<number>`COALESCE(SUM(duration_ms), 0)`.as('total_ms')])
    .where(sql`date(started_at)`, '=', date)
    .groupBy('context')
    .execute();
}

/** Total active ms per YYYY-MM-DD for a date range (inclusive). */
export async function getDailyActiveTimeForRange(
  fromDate: string,
  toDate: string,
): Promise<Map<string, number>> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('app_sessions')
    .select(['started_at', 'duration_ms'])
    .where(sql`date(started_at)`, '>=', fromDate)
    .where(sql`date(started_at)`, '<=', toDate)
    .execute();
  const out = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.started_at).toLocaleDateString('sv');
    out.set(d, (out.get(d) ?? 0) + r.duration_ms);
  }
  return out;
}

/** Context breakdown per YYYY-MM-DD for a date range (inclusive). */
export async function getDailyContextBreakdownForRange(
  fromDate: string,
  toDate: string,
): Promise<Map<string, ContextBreakdown[]>> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('app_sessions')
    .select(['started_at', 'context', sql<number>`SUM(duration_ms)`.as('total_ms')])
    .where(sql`date(started_at)`, '>=', fromDate)
    .where(sql`date(started_at)`, '<=', toDate)
    .groupBy([sql`date(started_at)`, 'context'])
    .execute();
  const out = new Map<string, ContextBreakdown[]>();
  for (const r of rows) {
    const d = new Date(r.started_at).toLocaleDateString('sv');
    const existing = out.get(d) ?? [];
    existing.push({context: r.context, total_ms: r.total_ms});
    out.set(d, existing);
  }
  return out;
}

/** Best-effort cleanup: orphaned rows left open by a crash get end-stamped. */
export async function reapOrphanSessions(staleAfterMs = 10 * 60 * 1000): Promise<number> {
  const db = await getLocalDb();
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const result = await db
    .updateTable('app_sessions')
    .set({ended_at: sql`started_at`}) // mark closed; duration_ms already accurate from heartbeats
    .where('ended_at', 'is', null)
    .where('started_at', '<', cutoff)
    .executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0);
}
