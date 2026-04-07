import {getLocalDb} from './client';

export interface FillStats {
  attempts: number;
  bestBpm: number | null;
  learned: boolean;
  lastPracticed: string | null;
}

export async function recordFillSession(
  fillId: string,
  bpm: number,
  learned: boolean,
): Promise<void> {
  const db = await getLocalDb();
  await db
    .insertInto('fill_practice_sessions')
    .values({
      fill_id: fillId,
      bpm,
      learned: learned ? 1 : 0,
      created_at: new Date().toISOString(),
    })
    .execute();
}

export async function getFillStats(fillId: string): Promise<FillStats> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('fill_practice_sessions')
    .select(['bpm', 'learned', 'created_at'])
    .where('fill_id', '=', fillId)
    .orderBy('created_at', 'desc')
    .execute();

  if (rows.length === 0) {
    return {attempts: 0, bestBpm: null, learned: false, lastPracticed: null};
  }

  const bestBpm = rows.reduce((max, row) => Math.max(max, row.bpm), 0);
  const learned = rows.some(row => row.learned === 1);
  const lastPracticed = rows[0].created_at;

  return {
    attempts: rows.length,
    bestBpm,
    learned,
    lastPracticed,
  };
}

export async function getAllFillStats(): Promise<Map<string, FillStats>> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('fill_practice_sessions')
    .select(['fill_id', 'bpm', 'learned', 'created_at'])
    .orderBy('created_at', 'desc')
    .execute();

  const map = new Map<string, FillStats>();

  for (const row of rows) {
    const existing = map.get(row.fill_id);
    if (!existing) {
      map.set(row.fill_id, {
        attempts: 1,
        bestBpm: row.bpm,
        learned: row.learned === 1,
        lastPracticed: row.created_at,
      });
    } else {
      existing.attempts += 1;
      if (row.bpm > (existing.bestBpm ?? 0)) {
        existing.bestBpm = row.bpm;
      }
      if (row.learned === 1) {
        existing.learned = true;
      }
      // lastPracticed is already the most recent because rows are ordered desc
    }
  }

  return map;
}
