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

/**
 * Aggregate the best-known status for every section of a chart, across every setlist the chart
 * appears in. Used by the song progress panel and the profile "songs you're learning" widget.
 *
 * If a section appears in multiple setlists with different statuses, the best ('nailed_it' >
 * 'practicing' > 'needs_work' > 'not_started') wins.
 */
const STATUS_RANK: Record<ProgressStatus, number> = {
  not_started: 0,
  practicing: 1,
  needs_work: 2,
  nailed_it: 3,
};

export interface SongProgressEntry {
  section: SongSection;
  status: ProgressStatus;
  updatedAt: string | null;
}

export interface SongMasteryView {
  chartMd5: string;
  sections: SongProgressEntry[];
  totalSections: number;
  nailedSections: number;
  lastTouchedAt: string | null;
}

export async function getSongMasteryByMd5(chartMd5: string): Promise<SongMasteryView> {
  const sections = await getSectionsForChart(chartMd5);
  if (sections.length === 0) {
    return {chartMd5, sections: [], totalSections: 0, nailedSections: 0, lastTouchedAt: null};
  }
  const db = await getLocalDb();
  const sectionIds = sections.map(s => s.id);
  const rows = await db
    .selectFrom('section_progress')
    .selectAll()
    .where('song_section_id', 'in', sectionIds)
    .execute();

  const bestByCstId = new Map<number, {status: ProgressStatus; updatedAt: string}>();
  for (const r of rows) {
    const status = r.status as ProgressStatus;
    const prior = bestByCstId.get(r.song_section_id);
    if (!prior || STATUS_RANK[status] > STATUS_RANK[prior.status]) {
      bestByCstId.set(r.song_section_id, {status, updatedAt: r.updated_at});
    }
  }

  const entries: SongProgressEntry[] = sections.map(section => {
    const best = bestByCstId.get(section.id);
    return {
      section,
      status: best?.status ?? 'not_started',
      updatedAt: best?.updatedAt ?? null,
    };
  });

  const nailed = entries.filter(e => e.status === 'nailed_it').length;
  const sortedTouches = entries
    .map(e => e.updatedAt)
    .filter((x): x is string => !!x)
    .sort();
  const lastTouchedAt = sortedTouches.length > 0 ? sortedTouches[sortedTouches.length - 1] : null;

  return {
    chartMd5,
    sections: entries,
    totalSections: entries.length,
    nailedSections: nailed,
    lastTouchedAt,
  };
}

/**
 * Recently-practiced charts with at least one section progressing — used by the profile
 * "Songs you're learning" widget. `limit` defaults to 5.
 */
export interface RecentSongView {
  chartMd5: string;
  totalSections: number;
  nailedSections: number;
  practicingSections: number;
  lastTouchedAt: string;
}

export async function getRecentlyPracticedSongs(limit = 5): Promise<RecentSongView[]> {
  const db = await getLocalDb();
  // We need to map section_progress rows back to their chart_md5 via song_sections.
  const rows = await db
    .selectFrom('section_progress as sp')
    .innerJoin('song_sections as ss', 'ss.id', 'sp.song_section_id')
    .select(['ss.chart_md5', 'sp.status', 'sp.updated_at'])
    .execute();

  type Acc = {chartMd5: string; total: number; nailed: number; practicing: number; lastTouched: string};
  const byChart = new Map<string, Acc>();
  for (const r of rows) {
    const acc = byChart.get(r.chart_md5) ?? {chartMd5: r.chart_md5, total: 0, nailed: 0, practicing: 0, lastTouched: r.updated_at};
    acc.total += 1;
    if (r.status === 'nailed_it') acc.nailed += 1;
    if (r.status === 'practicing') acc.practicing += 1;
    if (r.updated_at > acc.lastTouched) acc.lastTouched = r.updated_at;
    byChart.set(r.chart_md5, acc);
  }
  return [...byChart.values()]
    .sort((a, b) => (a.lastTouched < b.lastTouched ? 1 : -1))
    .slice(0, limit)
    .map(a => ({
      chartMd5: a.chartMd5,
      totalSections: a.total,
      nailedSections: a.nailed,
      practicingSections: a.practicing,
      lastTouchedAt: a.lastTouched,
    }));
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
