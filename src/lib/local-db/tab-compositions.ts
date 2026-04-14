import {sql} from 'kysely';
import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';

type CompositionRow = {
  id?: number;
  title: string;
  artist: string;
  album: string;
  tempo: number;
  instrument: string;
  is_saved: number;
  saved_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToComposition(r: CompositionRow): TabComposition {
  return {
    id: r.id!,
    title: r.title,
    artist: r.artist,
    album: r.album,
    tempo: r.tempo,
    instrument: r.instrument,
    isSaved: r.is_saved === 1,
    savedAt: r.saved_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type TabComposition = {
  id: number;
  title: string;
  artist: string;
  album: string;
  tempo: number;
  instrument: string;
  isSaved: boolean;
  savedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listCompositions(): Promise<TabComposition[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('tab_compositions')
    .select(['id', 'title', 'artist', 'album', 'tempo', 'instrument', 'is_saved', 'saved_at', 'created_at', 'updated_at'])
    .orderBy('updated_at', 'desc')
    .execute();

  return rows.map(rowToComposition);
}

export async function loadComposition(id: number): Promise<{meta: TabComposition; scoreData: ArrayBuffer} | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('tab_compositions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!row) return null;

  return {meta: rowToComposition(row), scoreData: row.score_data};
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

export async function getSavedCompositions(instrument: string, search?: string): Promise<TabComposition[]> {
  const db = await getLocalDb();
  let query = db
    .selectFrom('tab_compositions')
    .select(['id', 'title', 'artist', 'album', 'tempo', 'instrument', 'is_saved', 'saved_at', 'created_at', 'updated_at'])
    .where('is_saved', '=', 1)
    .where('instrument', '=', instrument)
    .orderBy('saved_at', 'desc');

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.where(eb =>
      eb.or([
        eb('title', 'like', term),
        eb('artist', 'like', term),
      ])
    );
  }

  const rows = await query.execute();
  return rows.map(rowToComposition);
}

export async function markCompositionSaved(id: number): Promise<void> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  await db
    .updateTable('tab_compositions')
    .set({is_saved: 1, saved_at: sql`COALESCE(saved_at, ${now})`})
    .where('id', '=', id)
    .execute();
}
