import {getLocalDb} from '../client';
import {ChorusScanSessions, DB} from '../types';
import {Kysely, Selectable} from 'kysely';

// Helper function to get current timestamp
function nowIso(): string {
  return new Date().toISOString();
}

// Scan session operations
export async function createScanSession(
  db: Kysely<DB>,
  scanSinceTime: Date,
  lastChartId: number,
): Promise<number> {
  const result = await db
    .insertInto('chorus_scan_sessions')
    .values({
      status: 'in_progress',
      started_at: nowIso(),
      scan_since_time: scanSinceTime.toISOString(),
      last_chart_id: lastChartId,
    })
    .returning('id')
    .execute();

  if (!result[0].id) {
    throw new Error('Failed to create scan session');
  }

  return result[0].id;
}

export async function updateScanProgress(
  db: Kysely<DB>,
  id: number,
  lastChartId: number,
): Promise<void> {
  await db
    .updateTable('chorus_scan_sessions')
    .set({
      last_chart_id: lastChartId,
    })
    .where(eb => eb('id', '=', id))
    .execute();
}

export async function completeScanSession(
  db: Kysely<DB>,
  id: number,
  completedAt: string = nowIso(),
): Promise<void> {
  // Mark session as completed
  await db
    .updateTable('chorus_scan_sessions')
    .set({
      status: 'completed',
      completed_at: completedAt,
    })
    .where(eb => eb('id', '=', id))
    .execute();

  // Update metadata
  await db
    .insertInto('chorus_metadata')
    .values({
      key: 'last_successful_scan',
      value: completedAt,
      updated_at: nowIso(),
    })
    .onConflict(oc =>
      oc.column('key').doUpdateSet(eb => ({
        value: eb.ref('excluded.value'),
        updated_at: completedAt,
      })),
    )
    .execute();
}

export async function getLastScanSession(): Promise<Selectable<ChorusScanSessions> | null> {
  const db = await getLocalDb();
  const latest = await db
    .selectFrom('chorus_scan_sessions')
    .selectAll()
    .where(eb =>
      eb.or([eb('status', '=', 'completed'), eb('status', '=', 'in_progress')]),
    )
    .orderBy('started_at', 'desc')
    .executeTakeFirst();

  return latest || null;
}
