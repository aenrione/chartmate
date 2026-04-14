import {sql} from 'kysely';
import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';
import {calculateSM2, todayISO} from '../repertoire/sm2';

// ── Types ────────────────────────────────────────────────────────────────────

export type ItemType = 'song' | 'song_section' | 'composition' | 'exercise';
export type ReferenceType = 'saved_chart' | 'song_section' | 'composition';

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
  referenceType: ReferenceType | null;
  referenceId: string | null;
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
    referenceType: row.reference_type as ReferenceType | null,
    referenceId: row.reference_id,
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
  referenceType?: ReferenceType;
  referenceId?: string;
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
      reference_type: data.referenceType ?? null,
      reference_id: data.referenceId ?? null,
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
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const rows = await db
    .selectFrom('repertoire_items')
    .selectAll()
    .where('next_review_date', '<', yesterday)
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
    referenceType: ReferenceType | null;
    referenceId: string | null;
  }>,
): Promise<void> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  await db
    .updateTable('repertoire_items')
    .set({
      ...(data.collectionId !== undefined && {collection_id: data.collectionId}),
      ...(data.title !== undefined && {title: data.title}),
      ...(data.artist !== undefined && {artist: data.artist}),
      ...(data.notes !== undefined && {notes: data.notes}),
      ...(data.targetBpm !== undefined && {target_bpm: data.targetBpm}),
      ...(data.referenceType !== undefined && {reference_type: data.referenceType}),
      ...(data.referenceId !== undefined && {reference_id: data.referenceId}),
      updated_at: now,
    })
    .where('id', '=', id)
    .execute();
}

export async function deleteItem(id: number): Promise<void> {
  const db = await getLocalDb();
  await db.deleteFrom('repertoire_items').where('id', '=', id).execute();
}

/** Check if a referenced item already has a repertoire entry */
export async function findItemByReference(
  referenceType: ReferenceType,
  referenceId: string,
): Promise<RepertoireItem | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('repertoire_items')
    .selectAll()
    .where('reference_type', '=', referenceType)
    .where('reference_id', '=', referenceId)
    .executeTakeFirst();
  return row ? rowToItem(row) : null;
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

  await db
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

  await db
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

  const items = await db
    .selectFrom('repertoire_items')
    .select(['id', 'next_review_date', 'repetitions'])
    .execute();

  const totalItems = items.length;
  const dueToday = items.filter(i => i.next_review_date <= today).length;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const overdue = items.filter(i => i.next_review_date < yesterday).length;
  const newItems = items.filter(i => i.repetitions === 0).length;
  const learningItems = items.filter(i => i.repetitions > 0 && i.repetitions < 2).length;
  const reviewItems = items.filter(i => i.repetitions >= 2).length;

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
  currentStreak = lastDate && (lastDate === today || lastDate === yesterday) ? streak : 0;

  return {
    totalItems,
    dueToday,
    overdue,
    newItems,
    learningItems,
    reviewItems,
    currentStreak,
    longestStreak,
    lastReviewDate: lastDate,
  };
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
