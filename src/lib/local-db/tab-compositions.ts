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
  preview_image?: string | null;
  youtube_url?: string | null;
  is_saved: number;
  saved_at: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToComposition(r: CompositionRow): TabComposition {
  return {
    id: r.id!,
    title: r.title,
    artist: r.artist,
    album: r.album,
    tempo: r.tempo,
    instrument: r.instrument,
    previewImage: r.preview_image ?? null,
    youtubeUrl: r.youtube_url ?? null,
    isSaved: r.is_saved === 1,
    savedAt: r.saved_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type CompositionSortOrder = 'saved_at_desc' | 'title_asc' | 'artist_asc' | 'tempo_asc';

export const COMPOSITION_SORT_MAP: Record<CompositionSortOrder, {col: any; dir: 'asc' | 'desc'}> = {
  saved_at_desc: {col: 'saved_at', dir: 'desc'},
  title_asc:     {col: 'title',    dir: 'asc'},
  artist_asc:    {col: 'artist',   dir: 'asc'},
  tempo_asc:     {col: 'tempo',    dir: 'asc'},
};

export type TabComposition = {
  id: number;
  title: string;
  artist: string;
  album: string;
  tempo: number;
  instrument: string;
  previewImage: string | null;
  youtubeUrl: string | null;
  isSaved: boolean;
  savedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listCompositions(): Promise<TabComposition[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('tab_compositions')
    .select(['id', 'title', 'artist', 'album', 'tempo', 'instrument', 'preview_image', 'youtube_url', 'is_saved', 'saved_at', 'created_at', 'updated_at'])
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
    previewImage?: string | null;
    youtubeUrl?: string | null;
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
        preview_image: meta.previewImage ?? null,
        youtube_url: meta.youtubeUrl ?? null,
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
      preview_image: meta.previewImage ?? null,
      youtube_url: meta.youtubeUrl ?? null,
      score_data: scoreData,
      created_at: now,
      updated_at: now,
    })
    .executeTakeFirstOrThrow();

  return Number(result.insertId);
}

export async function updateCompositionMeta(
  id: number,
  meta: {title: string; artist: string; album: string; tempo: number; instrument: string; previewImage?: string | null; youtubeUrl?: string | null},
): Promise<void> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  await db
    .updateTable('tab_compositions')
    .set({
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      tempo: meta.tempo,
      instrument: meta.instrument,
      preview_image: meta.previewImage ?? null,
      youtube_url: meta.youtubeUrl ?? null,
      updated_at: now,
    })
    .where('id', '=', id)
    .execute();
}

export async function deleteComposition(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .deleteFrom('tab_compositions')
    .where('id', '=', id)
    .execute();
}

export async function getSavedCompositions(
  instrument: string,
  search?: string,
  sort: CompositionSortOrder = 'saved_at_desc',
): Promise<TabComposition[]> {
  const db = await getLocalDb();

  const {col, dir} = COMPOSITION_SORT_MAP[sort];

  let query = db
    .selectFrom('tab_compositions')
    .select(['id', 'title', 'artist', 'album', 'tempo', 'instrument', 'preview_image', 'youtube_url', 'is_saved', 'saved_at', 'created_at', 'updated_at'])
    .where('is_saved', '=', 1)
    .where('instrument', '=', instrument)
    .orderBy(col, dir);

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

export async function deleteCompositionBatch(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getLocalDb();
  await db
    .deleteFrom('tab_compositions')
    .where('id', 'in', ids)
    .execute();
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
