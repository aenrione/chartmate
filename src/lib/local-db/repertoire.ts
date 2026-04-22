import {sql} from 'kysely';
import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';
import {calculateSM2, todayISO} from '../repertoire/sm2';

// ── Types ────────────────────────────────────────────────────────────────────

export type ItemType = 'song' | 'song_section' | 'composition' | 'exercise';

export interface RepertoireCollection {
  id: number;
  name: string;
  description: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepertoireItem {
  id: number;
  collectionId: number;
  itemType: ItemType;
  title: string;
  artist: string | null;
  notes: string | null;
  targetBpm: number | null;
  /** Typed FK to saved_charts.md5 */
  savedChartMd5: string | null;
  /** Typed FK to tab_compositions.id */
  compositionId: number | null;
  /** Typed FK to song_sections.id */
  songSectionId: number | null;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: string;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepertoireReview {
  id: number;
  itemId: number;
  quality: number;
  intervalBefore: number;
  intervalAfter: number;
  easeFactorBefore: number;
  easeFactorAfter: number;
  durationMs: number | null;
  sessionNotes: string | null;
  createdAt: string;
}

export interface RepertoireStats {
  totalItems: number;
  dueToday: number;
  overdue: number;
  newItems: number;
  learningItems: number;
  reviewItems: number;
  currentStreak: number;
  longestStreak: number;
  lastReviewDate: string | null;
}

// Typed linked resource — resolved from the item's FK columns
export type LinkedResource =
  | {
      type: 'saved_chart';
      md5: string;
      name: string;
      artist: string;
      charter: string | null;
      albumArtMd5: string | null;
      tabUrl: string | null;
      diffDrums: number | null;
      diffGuitar: number | null;
      diffBass: number | null;
      diffKeys: number | null;
      songLength: number | null;
      isDownloaded: boolean;
    }
  | { type: 'composition'; id: number; title: string; artist: string; tempo: number; instrument: string }
  | { type: 'song_section'; id: number; name: string; chartMd5: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToItem(row: any): RepertoireItem {
  return {
    id: row.id,
    collectionId: row.collection_id,
    itemType: row.item_type as ItemType,
    title: row.title,
    artist: row.artist,
    notes: row.notes,
    targetBpm: row.target_bpm,
    savedChartMd5: row.saved_chart_md5 ?? null,
    compositionId: row.composition_id ?? null,
    songSectionId: row.song_section_id ?? null,
    interval: row.interval,
    easeFactor: row.ease_factor,
    repetitions: row.repetitions,
    nextReviewDate: row.next_review_date,
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToReview(row: any): RepertoireReview {
  return {
    id: row.id,
    itemId: row.item_id,
    quality: row.quality,
    intervalBefore: row.interval_before,
    intervalAfter: row.interval_after,
    easeFactorBefore: row.ease_factor_before,
    easeFactorAfter: row.ease_factor_after,
    durationMs: row.duration_ms,
    sessionNotes: row.session_notes,
    createdAt: row.created_at,
  };
}

function rowToCollection(row: any): RepertoireCollection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Collection Functions ──────────────────────────────────────────────────────

export async function getCollections(): Promise<RepertoireCollection[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('repertoire_collections')
    .selectAll()
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map(rowToCollection);
}

export async function createCollection(data: {
  name: string;
  description?: string;
  color?: string;
}): Promise<number> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  const result = await db
    .insertInto('repertoire_collections')
    .values({
      name: data.name,
      description: data.description ?? null,
      color: data.color ?? '#6366f1',
      created_at: now,
      updated_at: now,
    })
    .executeTakeFirstOrThrow();
  return Number(result.insertId);
}

// ── Item CRUD ─────────────────────────────────────────────────────────────────

export async function createItem(data: {
  collectionId?: number;
  itemType: ItemType;
  title: string;
  artist?: string;
  notes?: string;
  targetBpm?: number;
  savedChartMd5?: string;
  compositionId?: number;
  songSectionId?: number;
}): Promise<number> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  const today = todayISO();
  const result = await db
    .insertInto('repertoire_items')
    .values({
      collection_id: data.collectionId ?? 1,
      item_type: data.itemType,
      title: data.title,
      artist: data.artist ?? null,
      notes: data.notes ?? null,
      target_bpm: data.targetBpm ?? null,
      reference_type: null,
      reference_id: null,
      saved_chart_md5: data.savedChartMd5 ?? null,
      composition_id: data.compositionId ?? null,
      song_section_id: data.songSectionId ?? null,
      interval: 1,
      ease_factor: 2.5,
      repetitions: 0,
      next_review_date: today,
      last_reviewed_at: null,
      created_at: now,
      updated_at: now,
    })
    .executeTakeFirstOrThrow();
  return Number(result.insertId);
}

export async function getItem(id: number): Promise<RepertoireItem | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('repertoire_items')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row ? rowToItem(row) : null;
}

export async function getAllItems(collectionId?: number): Promise<RepertoireItem[]> {
  const db = await getLocalDb();
  let query = db.selectFrom('repertoire_items').selectAll();
  if (collectionId !== undefined) {
    query = query.where('collection_id', '=', collectionId);
  }
  const rows = await query.orderBy('next_review_date', 'asc').execute();
  return rows.map(rowToItem);
}

/** Fetch multiple items by ID, returned in the same order as `ids`. */
export async function getItemsByIds(ids: number[]): Promise<RepertoireItem[]> {
  if (ids.length === 0) return [];
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('repertoire_items')
    .selectAll()
    .where('id', 'in', ids)
    .execute();
  const byId = new Map(rows.map(r => [Number(r.id), r]));
  return ids.map(id => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r).map(rowToItem);
}

export async function getItemsDueToday(): Promise<RepertoireItem[]> {
  const db = await getLocalDb();
  const today = todayISO();
  const rows = await db
    .selectFrom('repertoire_items')
    .selectAll()
    .where('next_review_date', '<=', today)
    .orderBy('next_review_date', 'asc')
    .execute();
  return rows.map(rowToItem);
}

export async function getOverdueItems(): Promise<RepertoireItem[]> {
  const db = await getLocalDb();
  const today = todayISO();
  // "overdue" = due on any day strictly before today (yesterday and earlier)
  const rows = await db
    .selectFrom('repertoire_items')
    .selectAll()
    .where('next_review_date', '<', today)
    .orderBy('next_review_date', 'asc')
    .execute();
  return rows.map(rowToItem);
}

export async function updateItem(
  id: number,
  data: Partial<{
    collectionId: number;
    title: string;
    artist: string | null;
    notes: string | null;
    targetBpm: number | null;
    savedChartMd5: string | null;
    compositionId: number | null;
    songSectionId: number | null;
  }>,
): Promise<void> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  const patch: {
    collection_id?: number;
    title?: string;
    artist?: string | null;
    notes?: string | null;
    target_bpm?: number | null;
    saved_chart_md5?: string | null;
    composition_id?: number | null;
    song_section_id?: number | null;
    updated_at: string;
  } = {updated_at: now};
  if (data.collectionId !== undefined) patch.collection_id = data.collectionId;
  if (data.title !== undefined) patch.title = data.title;
  if (data.artist !== undefined) patch.artist = data.artist;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.targetBpm !== undefined) patch.target_bpm = data.targetBpm;
  if (data.savedChartMd5 !== undefined) patch.saved_chart_md5 = data.savedChartMd5;
  if (data.compositionId !== undefined) patch.composition_id = data.compositionId;
  if (data.songSectionId !== undefined) patch.song_section_id = data.songSectionId;
  await db
    .updateTable('repertoire_items')
    .set(patch)
    .where('id', '=', id)
    .execute();
}

export async function deleteItem(id: number): Promise<void> {
  const db = await getLocalDb();
  await db.deleteFrom('repertoire_items').where('id', '=', id).execute();
}

/** Check if a chart already has a repertoire entry */
export async function findItemBySavedChart(md5: string): Promise<RepertoireItem | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('repertoire_items')
    .selectAll()
    .where('saved_chart_md5', '=', md5)
    .executeTakeFirst();
  return row ? rowToItem(row) : null;
}

/** Check if a composition already has a repertoire entry */
export async function findItemByComposition(compositionId: number): Promise<RepertoireItem | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('repertoire_items')
    .selectAll()
    .where('composition_id', '=', compositionId)
    .executeTakeFirst();
  return row ? rowToItem(row) : null;
}

// ── Linked Resource ───────────────────────────────────────────────────────────

/**
 * Fetch the linked resource for a repertoire item (chart, composition, or
 * song section). Returns null if the item has no link or the linked row no
 * longer exists.
 */
export async function fetchLinkedResource(item: RepertoireItem): Promise<LinkedResource | null> {
  const db = await getLocalDb();

  if (item.savedChartMd5) {
    const row = await db
      .selectFrom('saved_charts')
      .select([
        'md5', 'name', 'artist', 'charter', 'album_art_md5', 'tab_url',
        'diff_drums', 'diff_guitar', 'diff_bass', 'diff_keys',
        'song_length', 'is_downloaded',
      ])
      .where('md5', '=', item.savedChartMd5)
      .executeTakeFirst();
    if (!row) return null;
    return {
      type: 'saved_chart',
      md5: row.md5,
      name: row.name,
      artist: row.artist,
      charter: row.charter ?? null,
      albumArtMd5: row.album_art_md5 ?? null,
      tabUrl: (row as any).tab_url ?? null,
      diffDrums: row.diff_drums ?? null,
      diffGuitar: row.diff_guitar ?? null,
      diffBass: row.diff_bass ?? null,
      diffKeys: row.diff_keys ?? null,
      songLength: row.song_length ?? null,
      isDownloaded: row.is_downloaded === 1,
    };
  }

  if (item.compositionId) {
    const row = await db
      .selectFrom('tab_compositions')
      .select(['id', 'title', 'artist', 'tempo', 'instrument'])
      .where('id', '=', item.compositionId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      type: 'composition',
      id: Number(row.id),
      title: row.title,
      artist: row.artist,
      tempo: row.tempo,
      instrument: row.instrument,
    };
  }

  if (item.songSectionId) {
    const row = await db
      .selectFrom('song_sections')
      .select(['id', 'name', 'chart_md5'])
      .where('id', '=', item.songSectionId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      type: 'song_section',
      id: Number(row.id),
      name: row.name,
      chartMd5: row.chart_md5,
    };
  }

  return null;
}

// ── Reviews ───────────────────────────────────────────────────────────────────

/**
 * Record a review for an item. Applies SM-2 algorithm and updates item scheduling.
 */
export async function recordReview(
  itemId: number,
  quality: number,
  durationMs?: number,
  sessionNotes?: string,
): Promise<void> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();

  const item = await getItem(itemId);
  if (!item) throw new Error(`Repertoire item ${itemId} not found`);

  const {newInterval, newEaseFactor, newRepetitions, nextReviewDate} = calculateSM2(
    quality,
    item.repetitions,
    item.easeFactor,
    item.interval,
  );

  await db.transaction().execute(async trx => {
    await trx
      .insertInto('repertoire_reviews')
      .values({
        item_id: itemId,
        quality,
        interval_before: item.interval,
        interval_after: newInterval,
        ease_factor_before: item.easeFactor,
        ease_factor_after: newEaseFactor,
        duration_ms: durationMs ?? null,
        session_notes: sessionNotes ?? null,
        created_at: now,
      })
      .execute();

    await trx
      .updateTable('repertoire_items')
      .set({
        interval: newInterval,
        ease_factor: newEaseFactor,
        repetitions: newRepetitions,
        next_review_date: nextReviewDate,
        last_reviewed_at: now,
        updated_at: now,
      })
      .where('id', '=', itemId)
      .execute();
  });
}

export async function getItemReviewHistory(itemId: number): Promise<RepertoireReview[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('repertoire_reviews')
    .selectAll()
    .where('item_id', '=', itemId)
    .orderBy('created_at', 'desc')
    .execute();
  return rows.map(rowToReview);
}

export async function getReviewsOnDate(date: string): Promise<RepertoireReview[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('repertoire_reviews')
    .selectAll()
    .where(sql`DATE(created_at)`, '=', date)
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map(rowToReview);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getRepertoireStats(): Promise<RepertoireStats> {
  const db = await getLocalDb();
  const today = todayISO();

  // Single aggregate query instead of loading all rows into JS memory
  const [agg] = await sql<{
    total_items: number;
    due_today: number;
    overdue: number;
    new_items: number;
    learning_items: number;
    review_items: number;
  }>`
    SELECT
      COUNT(*) AS total_items,
      SUM(CASE WHEN next_review_date <= ${today} THEN 1 ELSE 0 END) AS due_today,
      SUM(CASE WHEN next_review_date < ${today} THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN repetitions = 0 THEN 1 ELSE 0 END) AS new_items,
      SUM(CASE WHEN repetitions = 1 THEN 1 ELSE 0 END) AS learning_items,
      SUM(CASE WHEN repetitions >= 2 THEN 1 ELSE 0 END) AS review_items
    FROM repertoire_items
  `.execute(db).then(r => r.rows);

  // Streak: consecutive days with at least one review
  const reviewDates = await db
    .selectFrom('repertoire_reviews')
    .select(sql<string>`DATE(created_at)`.as('review_date'))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)`, 'asc')
    .execute();

  const dates = reviewDates.map(r => r.review_date);
  let currentStreak = 0;
  let longestStreak = 0;
  let streak = dates.length > 0 ? 1 : 0;

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

  const lastDate = dates.length > 0 ? dates[dates.length - 1] : null;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  currentStreak = lastDate && (lastDate === today || lastDate === yesterday) ? streak : 0;

  return {
    totalItems: Number(agg?.total_items ?? 0),
    dueToday: Number(agg?.due_today ?? 0),
    overdue: Number(agg?.overdue ?? 0),
    newItems: Number(agg?.new_items ?? 0),
    learningItems: Number(agg?.learning_items ?? 0),
    reviewItems: Number(agg?.review_items ?? 0),
    currentStreak,
    longestStreak,
    lastReviewDate: lastDate,
  };
}

export interface SongSectionWithChart {
  id: number;
  name: string;
  chartMd5: string;
  chartName: string;
  chartArtist: string;
  albumArtMd5: string | null;
}

/**
 * Returns all song sections joined with their parent chart info.
 * Optional query filters by section name, chart name, or artist.
 */
export async function searchSongSectionsWithChart(query?: string): Promise<SongSectionWithChart[]> {
  const db = await getLocalDb();
  let q = db
    .selectFrom('song_sections')
    .innerJoin('saved_charts', 'saved_charts.md5', 'song_sections.chart_md5')
    .select([
      'song_sections.id',
      'song_sections.name',
      'song_sections.chart_md5 as chartMd5',
      'saved_charts.name as chartName',
      'saved_charts.artist as chartArtist',
      'saved_charts.album_art_md5 as albumArtMd5',
    ])
    .orderBy('saved_charts.name', 'asc')
    .orderBy('song_sections.sort_order', 'asc');

  if (query) {
    const like = `%${query}%`;
    q = q.where(eb =>
      eb.or([
        eb('song_sections.name', 'like', like),
        eb('saved_charts.name', 'like', like),
        eb('saved_charts.artist', 'like', like),
      ])
    );
  }

  const rows = await q.limit(30).execute();
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    chartMd5: r.chartMd5,
    chartName: r.chartName,
    chartArtist: r.chartArtist,
    albumArtMd5: r.albumArtMd5 ?? null,
  }));
}

export async function getStreakData(): Promise<{date: string; count: number}[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('repertoire_reviews')
    .select([
      sql<string>`DATE(created_at)`.as('date'),
      sql<number>`COUNT(*)`.as('count'),
    ])
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)`, 'asc')
    .execute();
  return rows.map(r => ({date: r.date, count: Number(r.count)}));
}
