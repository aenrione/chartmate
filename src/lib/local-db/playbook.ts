import {getLocalDb} from './client';
import {getCurrentTimestamp} from './db-utils';

// ── Type Definitions ──────────────────────────────────────────────────────────

export type ProgressStatus = 'not_started' | 'needs_work' | 'practicing' | 'nailed_it';

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export type PracticeSession = {
  id: number;
  setlistItemId: number;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  speed: number;
  notes: string | null;
};

export type SongSection = {
  id: number;
  chartMd5: string;
  name: string;
  startPosition: number;
  endPosition: number;
  sortOrder: number;
  pdfPage: number | null;
  pdfYOffset: number | null;
};

export type SectionProgressRecord = {
  id: number;
  songSectionId: number;
  setlistItemId: number;
  status: ProgressStatus;
  updatedAt: string;
};

export type SongAnnotation = {
  id: number;
  songSectionId: number;
  content: string;
  createdAt: string;
  updatedAt: string;
};

// ── Practice Session Functions ────────────────────────────────────────────────

export async function startPracticeSession(
  setlistItemId: number,
  speed: number,
): Promise<number> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  const result = await db
    .insertInto('practice_sessions')
    .values({
      setlist_item_id: setlistItemId,
      status: 'active',
      started_at: now,
      ended_at: null,
      speed,
      notes: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function endPracticeSession(
  sessionId: number,
  notes?: string,
): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('practice_sessions')
    .set({
      status: 'completed',
      ended_at: getCurrentTimestamp(),
      notes: notes ?? null,
    })
    .where('id', '=', sessionId)
    .execute();
}

export async function abandonOrphanedSessions(): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('practice_sessions')
    .set({
      status: 'abandoned',
      ended_at: getCurrentTimestamp(),
    })
    .where('status', '=', 'active')
    .execute();
}

export async function getPracticeHistory(
  setlistItemId: number,
): Promise<PracticeSession[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('practice_sessions')
    .selectAll()
    .where('setlist_item_id', '=', setlistItemId)
    .orderBy('started_at', 'desc')
    .execute();

  return rows.map(r => ({
    id: r.id,
    setlistItemId: r.setlist_item_id,
    status: r.status as SessionStatus,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    speed: r.speed,
    notes: r.notes,
  }));
}

// ── Song Section Functions ────────────────────────────────────────────────────

export async function getSectionsForChart(chartMd5: string): Promise<SongSection[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('song_sections')
    .selectAll()
    .where('chart_md5', '=', chartMd5)
    .orderBy('sort_order', 'asc')
    .execute();

  return rows.map(r => ({
    id: r.id,
    chartMd5: r.chart_md5,
    name: r.name,
    startPosition: r.start_position,
    endPosition: r.end_position,
    sortOrder: r.sort_order,
    pdfPage: r.pdf_page ?? null,
    pdfYOffset: r.pdf_y_offset ?? null,
  }));
}

export async function createSection(
  chartMd5: string,
  name: string,
  startPosition: number,
  endPosition: number,
  pdfPage?: number,
  pdfYOffset?: number,
): Promise<number> {
  const db = await getLocalDb();

  const last = await db
    .selectFrom('song_sections')
    .select(db.fn.max<number>('sort_order').as('max_sort'))
    .where('chart_md5', '=', chartMd5)
    .executeTakeFirst();

  const sortOrder = (last?.max_sort ?? -1) + 1;

  const result = await db
    .insertInto('song_sections')
    .values({
      chart_md5: chartMd5,
      name,
      start_position: startPosition,
      end_position: endPosition,
      sort_order: sortOrder,
      pdf_page: pdfPage ?? null,
      pdf_y_offset: pdfYOffset ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return result.id;
}

export async function updateSection(
  sectionId: number,
  updates: Partial<Pick<SongSection, 'name' | 'startPosition' | 'endPosition' | 'sortOrder'>>,
): Promise<void> {
  const db = await getLocalDb();
  const values: Record<string, string | number> = {};
  if (updates.name !== undefined) values.name = updates.name;
  if (updates.startPosition !== undefined) values.start_position = updates.startPosition;
  if (updates.endPosition !== undefined) values.end_position = updates.endPosition;
  if (updates.sortOrder !== undefined) values.sort_order = updates.sortOrder;
  if (Object.keys(values).length === 0) return;
  await db
    .updateTable('song_sections')
    .set(values)
    .where('id', '=', sectionId)
    .execute();
}

export async function deleteSection(sectionId: number): Promise<void> {
  const db = await getLocalDb();
  // Manually delete dependents since SQLite FK cascade isn't always enforced
  await db
    .deleteFrom('song_annotations')
    .where('song_section_id', '=', sectionId)
    .execute();
  await db
    .deleteFrom('section_progress')
    .where('song_section_id', '=', sectionId)
    .execute();
  await db
    .deleteFrom('song_sections')
    .where('id', '=', sectionId)
    .execute();
}

// ── Section Progress Functions ────────────────────────────────────────────────

export async function getSectionProgress(
  setlistItemId: number,
): Promise<SectionProgressRecord[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('section_progress')
    .selectAll()
    .where('setlist_item_id', '=', setlistItemId)
    .execute();

  return rows.map(r => ({
    id: r.id,
    songSectionId: r.song_section_id,
    setlistItemId: r.setlist_item_id,
    status: r.status as ProgressStatus,
    updatedAt: r.updated_at,
  }));
}

export async function updateSectionStatus(
  songSectionId: number,
  setlistItemId: number,
  status: ProgressStatus,
): Promise<void> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();

  const existing = await db
    .selectFrom('section_progress')
    .select('id')
    .where('song_section_id', '=', songSectionId)
    .where('setlist_item_id', '=', setlistItemId)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable('section_progress')
      .set({status, updated_at: now})
      .where('id', '=', existing.id)
      .execute();
  } else {
    await db
      .insertInto('section_progress')
      .values({
        song_section_id: songSectionId,
        setlist_item_id: setlistItemId,
        status,
        updated_at: now,
      })
      .execute();
  }
}

export function deriveSongStatus(
  sectionProgress: SectionProgressRecord[],
): ProgressStatus {
  if (sectionProgress.length === 0) return 'not_started';
  const statuses = sectionProgress.map(sp => sp.status);
  if (statuses.every(s => s === 'nailed_it')) return 'nailed_it';
  if (statuses.some(s => s === 'needs_work')) return 'needs_work';
  if (statuses.some(s => s === 'practicing' || s === 'nailed_it')) return 'practicing';
  return 'not_started';
}

// ── Annotation Functions ──────────────────────────────────────────────────────

export async function getAnnotations(chartMd5: string): Promise<SongAnnotation[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('song_annotations')
    .innerJoin('song_sections', 'song_sections.id', 'song_annotations.song_section_id')
    .selectAll('song_annotations')
    .where('song_sections.chart_md5', '=', chartMd5)
    .orderBy('song_annotations.created_at', 'asc')
    .execute();

  return rows.map(r => ({
    id: r.id,
    songSectionId: r.song_section_id,
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createAnnotation(
  songSectionId: number,
  content: string,
): Promise<number> {
  const db = await getLocalDb();
  const now = getCurrentTimestamp();
  const result = await db
    .insertInto('song_annotations')
    .values({
      song_section_id: songSectionId,
      content,
      created_at: now,
      updated_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function updateAnnotation(
  annotationId: number,
  content: string,
): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('song_annotations')
    .set({content, updated_at: getCurrentTimestamp()})
    .where('id', '=', annotationId)
    .execute();
}

export async function deleteAnnotation(annotationId: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .deleteFrom('song_annotations')
    .where('id', '=', annotationId)
    .execute();
}
