import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';

export type TabComposition = {
  id: number;
  title: string;
  artist: string;
  album: string;
  tempo: number;
  instrument: string;
  createdAt: string;
  updatedAt: string;
};

export async function listCompositions(): Promise<TabComposition[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('tab_compositions')
    .select(['id', 'title', 'artist', 'album', 'tempo', 'instrument', 'created_at', 'updated_at'])
    .orderBy('updated_at', 'desc')
    .execute();

  return rows.map(r => ({
    id: r.id!,
    title: r.title,
    artist: r.artist,
    album: r.album,
    tempo: r.tempo,
    instrument: r.instrument,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function loadComposition(id: number): Promise<{meta: TabComposition; scoreData: ArrayBuffer} | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('tab_compositions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!row) return null;

  return {
    meta: {
      id: row.id!,
      title: row.title,
      artist: row.artist,
      album: row.album,
      tempo: row.tempo,
      instrument: row.instrument,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    scoreData: row.score_data,
  };
}

export async function saveComposition(
  scoreData: ArrayBuffer,
  meta: {
    id?: number;
    title: string;
    artist: string;
    album: string;
    tempo: number;
    instrument: string;
  },
): Promise<number> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();

  if (meta.id) {
    await db
      .updateTable('tab_compositions')
      .set({
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        tempo: meta.tempo,
        instrument: meta.instrument,
        score_data: scoreData,
        updated_at: now,
      })
      .where('id', '=', meta.id)
      .execute();
    return meta.id;
  }

  const result = await db
    .insertInto('tab_compositions')
    .values({
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      tempo: meta.tempo,
      instrument: meta.instrument,
      score_data: scoreData,
      created_at: now,
      updated_at: now,
    })
    .executeTakeFirstOrThrow();

  return Number(result.insertId);
}

export async function deleteComposition(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .deleteFrom('tab_compositions')
    .where('id', '=', id)
    .execute();
}
