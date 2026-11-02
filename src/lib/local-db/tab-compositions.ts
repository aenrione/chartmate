import {sql} from 'kysely';
import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';
import {normalizeTags, tagKey} from '@/lib/composition-tags';

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
  archived_at?: string | null;
};

/** The metadata columns every listing selects (everything but the score blob). */
export const COMPOSITION_COLUMNS = [
  'id', 'title', 'artist', 'album', 'tempo', 'instrument', 'preview_image',
  'youtube_url', 'is_saved', 'saved_at', 'created_at', 'updated_at', 'archived_at',
] as const;

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
    archivedAt: r.archived_at ?? null,
    tags: [],
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
  /** When set, the composition is archived: hidden from library browsing, never deleted. */
  archivedAt: string | null;
  /** Sorted case-insensitively. Filled by the list/load functions in this file. */
  tags: string[];
};

/**
 * Which side of the archive a listing shows. `active` (the default everywhere in
 * the app) hides archived compositions; `archived` shows only those; `all` is for
 * agents and pickers that must see everything.
 */
export type ArchiveScope = 'active' | 'archived' | 'all';

export const isArchived = (comp: {archivedAt: string | null}): boolean => comp.archivedAt !== null;

// ─── Tags ─────────────────────────────────────────────────────────────────────

// Stay well under SQLite's bound-parameter limit when filtering by many ids.
const TAG_ID_CHUNK = 500;

/** Tags for each composition id, sorted case-insensitively. Ids without tags are absent. */
export async function getCompositionTags(ids: number[]): Promise<Map<number, string[]>> {
  const byId = new Map<number, string[]>();
  if (ids.length === 0) return byId;
  const db = await getLocalDb();
  for (let i = 0; i < ids.length; i += TAG_ID_CHUNK) {
    const rows = await db
      .selectFrom('composition_tags')
      .select(['composition_id', 'tag'])
      .where('composition_id', 'in', ids.slice(i, i + TAG_ID_CHUNK))
      .orderBy('tag', 'asc')
      .execute();
    for (const row of rows) {
      const list = byId.get(row.composition_id);
      if (list) list.push(row.tag);
      else byId.set(row.composition_id, [row.tag]);
    }
  }
  return byId;
}

/** Return the compositions with their `tags` filled in. */
export async function attachTags(comps: TabComposition[]): Promise<TabComposition[]> {
  if (comps.length === 0) return comps;
  const byId = await getCompositionTags(comps.map(c => c.id));
  return comps.map(c => ({...c, tags: byId.get(c.id) ?? []}));
}

/**
 * Replace the tag set of a composition. Tags are trimmed and deduped ignoring
 * case (first spelling kept). Returns the tags that were stored.
 */
export async function setCompositionTags(id: number, tags: readonly unknown[]): Promise<string[]> {
  const clean = normalizeTags(tags);
  const db = await getLocalDb();
  await db.deleteFrom('composition_tags').where('composition_id', '=', id).execute();
  if (clean.length > 0) {
    await db
      .insertInto('composition_tags')
      .values(clean.map(tag => ({composition_id: id, tag})))
      .execute();
  }
  return clean;
}

// Two bound parameters per inserted row; keep each insert well under the limit.
const TAG_INSERT_CHUNK = 200;

/**
 * Add one tag to many compositions. Compositions that already have it (ignoring
 * case) keep their spelling. Returns how many compositions gained the tag.
 */
export async function addTagToCompositions(ids: number[], tag: string): Promise<number> {
  const [clean] = normalizeTags([tag]);
  if (!clean || ids.length === 0) return 0;
  const key = tagKey(clean);
  const existing = await getCompositionTags(ids);
  const targets = [...new Set(ids)].filter(id => !(existing.get(id) ?? []).some(t => tagKey(t) === key));
  if (targets.length === 0) return 0;
  const db = await getLocalDb();
  for (let i = 0; i < targets.length; i += TAG_INSERT_CHUNK) {
    await db
      .insertInto('composition_tags')
      .values(targets.slice(i, i + TAG_INSERT_CHUNK).map(composition_id => ({composition_id, tag: clean})))
      .execute();
  }
  return targets.length;
}

/** Remove one tag (ignoring case) from many compositions. Returns how many lost it. */
export async function removeTagFromCompositions(ids: number[], tag: string): Promise<number> {
  const key = tagKey(tag);
  if (!key || ids.length === 0) return 0;
  const existing = await getCompositionTags(ids);
  const db = await getLocalDb();
  let removed = 0;
  for (const [id, tags] of existing) {
    const spellings = tags.filter(t => tagKey(t) === key);
    if (spellings.length === 0) continue;
    await db
      .deleteFrom('composition_tags')
      .where('composition_id', '=', id)
      .where('tag', 'in', spellings)
      .execute();
    removed++;
  }
  return removed;
}

/** Every tag in use with how many compositions carry it, for suggestions. */
export async function listAllCompositionTags(): Promise<{tag: string; count: number}[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('composition_tags')
    .select(eb => ['tag', eb.fn.countAll<number>().as('count')])
    .groupBy('tag')
    .orderBy('tag', 'asc')
    .execute();
  return rows.map(r => ({tag: r.tag, count: Number(r.count)}));
}

/**
 * Every composition, newest first. Defaults to `all` on purpose: this backs the
 * MCP, setlists and the repertoire picker, where an archived score must still be
 * reachable by reference.
 */
export async function listCompositions(scope: ArchiveScope = 'all'): Promise<TabComposition[]> {
  const db = await getLocalDb();
  let query = db
    .selectFrom('tab_compositions')
    .select(COMPOSITION_COLUMNS)
    .orderBy('updated_at', 'desc');
  if (scope !== 'all') query = query.where('archived_at', scope === 'archived' ? 'is not' : 'is', null);
  const rows = await query.execute();

  return attachTags(rows.map(rowToComposition));
}

export async function loadComposition(id: number): Promise<{meta: TabComposition; scoreData: ArrayBuffer} | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('tab_compositions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!row) return null;

  // Tauri SQL plugin deserializes SQLite blobs as number[], not ArrayBuffer.
  // Convert to Uint8Array so AlphaTab (and any other consumer) can load it.
  const raw = row.score_data as unknown;
  const scoreData: Uint8Array = raw instanceof Uint8Array
    ? raw
    : new Uint8Array(raw as ArrayLike<number>);

  const [meta] = await attachTags([rowToComposition(row)]);
  return {meta, scoreData: scoreData.buffer as ArrayBuffer};
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
    /** Replaces the tag set when given; left unchanged when omitted. */
    tags?: readonly unknown[];
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
    if (meta.tags !== undefined) await setCompositionTags(meta.id, meta.tags);
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

  const id = Number(result.insertId);
  if (meta.tags !== undefined) await setCompositionTags(id, meta.tags);
  return id;
}

export async function updateCompositionMeta(
  id: number,
  meta: {
    title: string; artist: string; album: string; tempo: number; instrument: string;
    previewImage?: string | null; youtubeUrl?: string | null;
    /** Replaces the tag set when given; left unchanged when omitted. */
    tags?: readonly unknown[];
  },
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
  if (meta.tags !== undefined) await setCompositionTags(id, meta.tags);
}

export async function deleteComposition(id: number): Promise<void> {
  const db = await getLocalDb();
  // The FK cascades too; delete explicitly so it holds even if foreign_keys is off.
  await db.deleteFrom('composition_tags').where('composition_id', '=', id).execute();
  await db
    .deleteFrom('tab_compositions')
    .where('id', '=', id)
    .execute();
}

export async function getSavedCompositions(
  instrument: string,
  search?: string,
  sort: CompositionSortOrder = 'saved_at_desc',
  scope: ArchiveScope = 'active',
): Promise<TabComposition[]> {
  const db = await getLocalDb();

  const {col, dir} = COMPOSITION_SORT_MAP[sort];

  let query = db
    .selectFrom('tab_compositions')
    .select(COMPOSITION_COLUMNS)
    .where('is_saved', '=', 1)
    .where('instrument', '=', instrument)
    .orderBy(col, dir);

  if (scope !== 'all') query = query.where('archived_at', scope === 'archived' ? 'is not' : 'is', null);

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
  return attachTags(rows.map(rowToComposition));
}

export async function deleteCompositionBatch(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getLocalDb();
  // Same cleanup as deleteComposition (tags, then the row), chunked for large selections.
  for (let i = 0; i < ids.length; i += TAG_ID_CHUNK) {
    const chunk = ids.slice(i, i + TAG_ID_CHUNK);
    await db.deleteFrom('composition_tags').where('composition_id', 'in', chunk).execute();
    await db.deleteFrom('tab_compositions').where('id', 'in', chunk).execute();
  }
}

/** Recent list on the instrument hubs: browsing, so archived compositions are hidden. */
export async function getRecentCompositions(instrument: string, limit = 5): Promise<TabComposition[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('tab_compositions')
    .select(COMPOSITION_COLUMNS)
    .where('is_saved', '=', 1)
    .where('instrument', '=', instrument)
    .where('archived_at', 'is', null)
    .orderBy('updated_at', 'desc')
    .limit(limit)
    .execute();
  return attachTags(rows.map(rowToComposition));
}

// ─── Archiving ────────────────────────────────────────────────────────────────

/**
 * Archive or unarchive one composition. Nothing is deleted: the score, its tags
 * and its stem associations stay exactly as they are, so this is reversible.
 * Returns the stored `archived_at` (null when unarchived).
 */
export async function setCompositionArchived(id: number, archived: boolean): Promise<string | null> {
  const archivedAt = archived ? getCurrentTimestamp() : null;
  const db = await getLocalDb();
  await db
    .updateTable('tab_compositions')
    .set({archived_at: archivedAt})
    .where('id', '=', id)
    .execute();
  return archivedAt;
}

/**
 * Archive or unarchive many compositions at once, chunked to stay under SQLite's
 * bound-parameter limit. Returns how many ids were written.
 */
export async function setCompositionsArchived(ids: number[], archived: boolean): Promise<number> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return 0;
  const archivedAt = archived ? getCurrentTimestamp() : null;
  const db = await getLocalDb();
  for (let i = 0; i < unique.length; i += TAG_ID_CHUNK) {
    await db
      .updateTable('tab_compositions')
      .set({archived_at: archivedAt})
      .where('id', 'in', unique.slice(i, i + TAG_ID_CHUNK))
      .execute();
  }
  return unique.length;
}

/**
 * How many saved compositions are archived, for the library's "Archived" toggle.
 * Without an instrument it counts every instrument (the All tab).
 */
export async function countArchivedCompositions(instrument?: string): Promise<number> {
  const db = await getLocalDb();
  let query = db
    .selectFrom('tab_compositions')
    .select(eb => eb.fn.countAll<number>().as('count'))
    .where('is_saved', '=', 1)
    .where('archived_at', 'is not', null);
  if (instrument) query = query.where('instrument', '=', instrument);
  const row = await query.executeTakeFirst();
  return Number(row?.count ?? 0);
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
