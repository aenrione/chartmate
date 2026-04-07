# Playbook Practice Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen practice mode that opens from a setlist and lets musicians page through songs one at a time with speed control, section tracking, looping, annotations, and progress history.

**Architecture:** Layered Playbook with a `PlaybookProvider` context wrapping the page. A collapsible sidebar holds practice tools (sections, controls, audio, annotations). The main area renders charts via an adapter that delegates to existing renderers (drum sheet music, AlphaTab). Four new DB tables track sections, progress, annotations, and practice sessions.

**Tech Stack:** React 19, React Router 7, Kysely (SQLite via Tauri), Radix UI, Tailwind CSS 4, lucide-react, existing AudioManager + AlphaTab renderers.

**Spec:** `docs/superpowers/specs/2026-04-07-playbook-practice-mode-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/local-db/migrations/012_playbook.ts` | DB migration for 4 new tables |
| `src/lib/local-db/playbook.ts` | Data access layer for playbook tables |
| `src/pages/playbook/PlaybookPage.tsx` | Main page component with provider + layout |
| `src/pages/playbook/PlaybookProvider.tsx` | React context for shared playbook state |
| `src/pages/playbook/PlaybookSidebar.tsx` | Collapsible sidebar with all panels |
| `src/pages/playbook/PlaybookTopBar.tsx` | Top bar with navigation, song counter |
| `src/pages/playbook/SongHeader.tsx` | Song title, artist, instrument badge, metadata |
| `src/pages/playbook/ChartViewer.tsx` | Adapter that delegates to correct renderer |
| `src/pages/playbook/PlaybackControls.tsx` | Floating glassmorphism transport bar |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/local-db/migrations/index.ts` | Register migration 012 |
| `src/lib/local-db/types.ts` | Add 4 new table interfaces to DB |
| `src/App.tsx` | Add `/playbook/:setlistId` route |
| `src/components/Layout.tsx` | Hide app sidebar on `/playbook` routes |
| `src/pages/SetlistsPage.tsx` | Add "Practice" button to SetlistEditor header |

---

## Task 1: Database Migration

**Files:**
- Create: `src/lib/local-db/migrations/012_playbook.ts`
- Modify: `src/lib/local-db/migrations/index.ts`
- Modify: `src/lib/local-db/types.ts`

- [ ] **Step 1: Create the migration file**

Create `src/lib/local-db/migrations/012_playbook.ts`:

```typescript
import {type Kysely, type Migration} from 'kysely';

export const migration_012_playbook: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('practice_sessions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('setlist_item_id', 'integer', cb => cb.notNull().references('setlist_items.id'))
      .addColumn('status', 'text', cb => cb.notNull().defaultTo('active'))
      .addColumn('started_at', 'text', cb => cb.notNull())
      .addColumn('ended_at', 'text')
      .addColumn('speed', 'integer', cb => cb.notNull())
      .addColumn('notes', 'text')
      .execute();

    await db.schema
      .createIndex('idx_practice_sessions_item')
      .ifNotExists()
      .on('practice_sessions')
      .column('setlist_item_id')
      .execute();

    await db.schema
      .createIndex('idx_practice_sessions_started')
      .ifNotExists()
      .on('practice_sessions')
      .column('started_at')
      .execute();

    await db.schema
      .createTable('song_sections')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('chart_md5', 'text', cb => cb.notNull())
      .addColumn('name', 'text', cb => cb.notNull())
      .addColumn('start_position', 'real', cb => cb.notNull())
      .addColumn('end_position', 'real', cb => cb.notNull())
      .addColumn('sort_order', 'integer', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_song_sections_chart')
      .ifNotExists()
      .on('song_sections')
      .columns(['chart_md5', 'sort_order'])
      .execute();

    await db.schema
      .createTable('section_progress')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('song_section_id', 'integer', cb => cb.notNull().references('song_sections.id'))
      .addColumn('setlist_item_id', 'integer', cb => cb.notNull().references('setlist_items.id'))
      .addColumn('status', 'text', cb => cb.notNull().defaultTo('not_started'))
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_section_progress_section')
      .ifNotExists()
      .on('section_progress')
      .column('song_section_id')
      .execute();

    await db.schema
      .createIndex('idx_section_progress_item')
      .ifNotExists()
      .on('section_progress')
      .column('setlist_item_id')
      .execute();

    await db.schema
      .createTable('song_annotations')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('song_section_id', 'integer', cb => cb.notNull().references('song_sections.id'))
      .addColumn('content', 'text', cb => cb.notNull())
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_song_annotations_section')
      .ifNotExists()
      .on('song_annotations')
      .column('song_section_id')
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_song_annotations_section').ifExists().execute();
    await db.schema.dropTable('song_annotations').ifExists().execute();
    await db.schema.dropIndex('idx_section_progress_item').ifExists().execute();
    await db.schema.dropIndex('idx_section_progress_section').ifExists().execute();
    await db.schema.dropTable('section_progress').ifExists().execute();
    await db.schema.dropIndex('idx_song_sections_chart').ifExists().execute();
    await db.schema.dropTable('song_sections').ifExists().execute();
    await db.schema.dropIndex('idx_practice_sessions_started').ifExists().execute();
    await db.schema.dropIndex('idx_practice_sessions_item').ifExists().execute();
    await db.schema.dropTable('practice_sessions').ifExists().execute();
  },
};
```

- [ ] **Step 2: Register the migration**

In `src/lib/local-db/migrations/index.ts`, add the import and registration:

```typescript
import {migration_012_playbook} from './012_playbook';
```

Add to the `migrations` object:

```typescript
'012_playbook': migration_012_playbook,
```

- [ ] **Step 3: Add type interfaces**

In `src/lib/local-db/types.ts`, add these interfaces before the `DB` interface:

```typescript
export interface PracticeSessions {
  id: Generated<number>;
  setlist_item_id: number;
  status: string;
  started_at: string;
  ended_at: string | null;
  speed: number;
  notes: string | null;
}

export interface SongSections {
  id: Generated<number>;
  chart_md5: string;
  name: string;
  start_position: number;
  end_position: number;
  sort_order: number;
}

export interface SectionProgress {
  id: Generated<number>;
  song_section_id: number;
  setlist_item_id: number;
  status: string;
  updated_at: string;
}

export interface SongAnnotations {
  id: Generated<number>;
  song_section_id: number;
  content: string;
  created_at: string;
  updated_at: string;
}
```

Add to the `DB` interface:

```typescript
practice_sessions: PracticeSessions;
song_sections: SongSections;
section_progress: SectionProgress;
song_annotations: SongAnnotations;
```

- [ ] **Step 4: Verify the app starts**

Run: `npm run dev` (or `pnpm dev`)

Check the console — migration should auto-run. No errors expected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/local-db/migrations/012_playbook.ts src/lib/local-db/migrations/index.ts src/lib/local-db/types.ts
git commit -m "feat(playbook): add database migration for practice sessions, sections, progress, annotations"
```

---

## Task 2: Data Access Layer

**Files:**
- Create: `src/lib/local-db/playbook.ts`

- [ ] **Step 1: Create the playbook data access module**

Create `src/lib/local-db/playbook.ts`:

```typescript
import {getLocalDb} from './client';

// ── Types ───────────────────────────────────────────────────────────

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

// ── Practice Sessions ───────────────────────────────────────────────

export async function startPracticeSession(
  setlistItemId: number,
  speed: number,
): Promise<number> {
  const db = await getLocalDb();
  const result = await db
    .insertInto('practice_sessions')
    .values({
      setlist_item_id: setlistItemId,
      status: 'active',
      started_at: new Date().toISOString(),
      speed,
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
      ended_at: new Date().toISOString(),
      ...(notes !== undefined ? {notes} : {}),
    })
    .where('id', '=', sessionId)
    .execute();
}

export async function abandonOrphanedSessions(): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('practice_sessions')
    .set({status: 'abandoned', ended_at: new Date().toISOString()})
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

// ── Song Sections ───────────────────────────────────────────────────

export async function getSectionsForChart(
  chartMd5: string,
): Promise<SongSection[]> {
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
  }));
}

export async function createSection(
  chartMd5: string,
  name: string,
  startPosition: number,
  endPosition: number,
): Promise<number> {
  const db = await getLocalDb();

  const last = await db
    .selectFrom('song_sections')
    .select(db.fn.max<number>('sort_order').as('max_order'))
    .where('chart_md5', '=', chartMd5)
    .executeTakeFirst();

  const nextOrder = (last?.max_order ?? -1) + 1;

  const result = await db
    .insertInto('song_sections')
    .values({
      chart_md5: chartMd5,
      name,
      start_position: startPosition,
      end_position: endPosition,
      sort_order: nextOrder,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function updateSection(
  sectionId: number,
  updates: {name?: string; startPosition?: number; endPosition?: number},
): Promise<void> {
  const db = await getLocalDb();
  const values: Record<string, any> = {};
  if (updates.name !== undefined) values.name = updates.name;
  if (updates.startPosition !== undefined) values.start_position = updates.startPosition;
  if (updates.endPosition !== undefined) values.end_position = updates.endPosition;
  if (Object.keys(values).length === 0) return;
  await db.updateTable('song_sections').set(values).where('id', '=', sectionId).execute();
}

export async function deleteSection(sectionId: number): Promise<void> {
  const db = await getLocalDb();
  // Cascade: annotations and progress deleted by FK cascade in SQLite
  // But SQLite doesn't enforce FK cascade by default in all modes,
  // so delete dependents explicitly to be safe
  await db.deleteFrom('song_annotations').where('song_section_id', '=', sectionId).execute();
  await db.deleteFrom('section_progress').where('song_section_id', '=', sectionId).execute();
  await db.deleteFrom('song_sections').where('id', '=', sectionId).execute();
}

// ── Section Progress ────────────────────────────────────────────────

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
  const now = new Date().toISOString();

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

// ── Annotations ─────────────────────────────────────────────────────

export async function getAnnotations(
  chartMd5: string,
): Promise<SongAnnotation[]> {
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
  const now = new Date().toISOString();
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
    .set({content, updated_at: new Date().toISOString()})
    .where('id', '=', annotationId)
    .execute();
}

export async function deleteAnnotation(annotationId: number): Promise<void> {
  const db = await getLocalDb();
  await db.deleteFrom('song_annotations').where('id', '=', annotationId).execute();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/local-db/playbook.ts
git commit -m "feat(playbook): add data access layer for sections, progress, sessions, annotations"
```

---

## Task 3: PlaybookProvider (Context)

**Files:**
- Create: `src/pages/playbook/PlaybookProvider.tsx`

- [ ] **Step 1: Create the provider**

Create `src/pages/playbook/PlaybookProvider.tsx`:

```typescript
import {createContext, useContext, useState, useCallback, useEffect, type ReactNode} from 'react';
import {type Setlist, type SetlistItem, getSetlistItems} from '@/lib/local-db/setlists';
import {
  type SongSection,
  type SectionProgressRecord,
  type SongAnnotation,
  type ProgressStatus,
  type PracticeSession,
  getSectionsForChart,
  getSectionProgress,
  getAnnotations,
  updateSectionStatus,
  createSection,
  deleteSection,
  updateSection,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  startPracticeSession,
  endPracticeSession,
  deriveSongStatus,
} from '@/lib/local-db/playbook';
import {updateSetlistItemSpeed} from '@/lib/local-db/setlists';

type PlaybookContextValue = {
  // Data
  setlist: Setlist;
  items: SetlistItem[];
  activeIndex: number;
  activeItem: SetlistItem | null;
  sections: SongSection[];
  sectionProgress: SectionProgressRecord[];
  annotations: SongAnnotation[];
  sessionId: number | null;

  // Playback
  isPlaying: boolean;
  speed: number;
  loopSectionId: number | null;

  // UI
  sidebarExpanded: boolean;

  // Derived
  songStatus: ProgressStatus;

  // Actions
  goToSong: (index: number) => void;
  nextSong: () => void;
  prevSong: () => void;
  setSpeed: (speed: number) => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  setLoopSectionId: (sectionId: number | null) => void;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;

  // Section CRUD
  addSection: (name: string, startPos: number, endPos: number) => Promise<void>;
  removeSection: (sectionId: number) => Promise<void>;
  editSection: (sectionId: number, updates: {name?: string; startPosition?: number; endPosition?: number}) => Promise<void>;
  setSectionStatus: (sectionId: number, status: ProgressStatus) => Promise<void>;

  // Annotation CRUD
  addAnnotation: (sectionId: number, content: string) => Promise<void>;
  editAnnotation: (annotationId: number, content: string) => Promise<void>;
  removeAnnotation: (annotationId: number) => Promise<void>;
};

const PlaybookContext = createContext<PlaybookContextValue | null>(null);

export function usePlaybook() {
  const ctx = useContext(PlaybookContext);
  if (!ctx) throw new Error('usePlaybook must be used within PlaybookProvider');
  return ctx;
}

export function PlaybookProvider({
  setlist,
  initialItems,
  initialIndex,
  children,
}: {
  setlist: Setlist;
  initialItems: SetlistItem[];
  initialIndex: number;
  children: ReactNode;
}) {
  const [items] = useState(initialItems);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [sections, setSections] = useState<SongSection[]>([]);
  const [sectionProgress, setSectionProgress] = useState<SectionProgressRecord[]>([]);
  const [annotations, setAnnotations] = useState<SongAnnotation[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(initialItems[initialIndex]?.speed ?? 100);
  const [loopSectionId, setLoopSectionId] = useState<number | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const activeItem = items[activeIndex] ?? null;
  const songStatus = deriveSongStatus(sectionProgress);

  // Load data when active song changes
  const loadSongData = useCallback(async (item: SetlistItem) => {
    const [secs, progress, annots] = await Promise.all([
      getSectionsForChart(item.chartMd5),
      getSectionProgress(item.id),
      getAnnotations(item.chartMd5),
    ]);
    setSections(secs);
    setSectionProgress(progress);
    setAnnotations(annots);
    setSpeedState(item.speed);
    setLoopSectionId(null);
  }, []);

  useEffect(() => {
    if (activeItem) loadSongData(activeItem);
  }, [activeItem, loadSongData]);

  // Start practice session on mount
  useEffect(() => {
    if (!activeItem) return;
    let id: number;
    startPracticeSession(activeItem.id, speed).then(newId => {
      id = newId;
      setSessionId(newId);
    });
    return () => {
      if (id) endPracticeSession(id);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const goToSong = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return;
    setIsPlaying(false);
    setActiveIndex(index);
  }, [items.length]);

  const nextSong = useCallback(() => goToSong(activeIndex + 1), [activeIndex, goToSong]);
  const prevSong = useCallback(() => goToSong(activeIndex - 1), [activeIndex, goToSong]);

  const setSpeed = useCallback(async (newSpeed: number) => {
    const clamped = Math.max(5, Math.min(200, Math.round(newSpeed / 5) * 5));
    setSpeedState(clamped);
    if (activeItem) {
      await updateSetlistItemSpeed(activeItem.id, clamped);
    }
  }, [activeItem]);

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);
  const toggleSidebar = useCallback(() => setSidebarExpanded(p => !p), []);

  // Section CRUD
  const addSection = useCallback(async (name: string, startPos: number, endPos: number) => {
    if (!activeItem) return;
    await createSection(activeItem.chartMd5, name, startPos, endPos);
    setSections(await getSectionsForChart(activeItem.chartMd5));
  }, [activeItem]);

  const removeSection = useCallback(async (sectionId: number) => {
    if (!activeItem) return;
    await deleteSection(sectionId);
    setSections(await getSectionsForChart(activeItem.chartMd5));
    setAnnotations(await getAnnotations(activeItem.chartMd5));
    if (loopSectionId === sectionId) setLoopSectionId(null);
  }, [activeItem, loopSectionId]);

  const editSection = useCallback(async (sectionId: number, updates: {name?: string; startPosition?: number; endPosition?: number}) => {
    if (!activeItem) return;
    await updateSection(sectionId, updates);
    setSections(await getSectionsForChart(activeItem.chartMd5));
  }, [activeItem]);

  const setSectionStatus = useCallback(async (sectionId: number, status: ProgressStatus) => {
    if (!activeItem) return;
    await updateSectionStatus(sectionId, activeItem.id, status);
    setSectionProgress(await getSectionProgress(activeItem.id));
  }, [activeItem]);

  // Annotation CRUD
  const addAnnotation = useCallback(async (sectionId: number, content: string) => {
    if (!activeItem) return;
    await createAnnotation(sectionId, content);
    setAnnotations(await getAnnotations(activeItem.chartMd5));
  }, [activeItem]);

  const editAnnotation = useCallback(async (annotationId: number, content: string) => {
    if (!activeItem) return;
    await updateAnnotation(annotationId, content);
    setAnnotations(await getAnnotations(activeItem.chartMd5));
  }, [activeItem]);

  const removeAnnotation = useCallback(async (annotationId: number) => {
    if (!activeItem) return;
    await deleteAnnotation(annotationId);
    setAnnotations(await getAnnotations(activeItem.chartMd5));
  }, [activeItem]);

  return (
    <PlaybookContext.Provider value={{
      setlist, items, activeIndex, activeItem,
      sections, sectionProgress, annotations, sessionId,
      isPlaying, speed, loopSectionId,
      sidebarExpanded, songStatus,
      goToSong, nextSong, prevSong, setSpeed, togglePlay, setIsPlaying,
      setLoopSectionId, toggleSidebar, setSidebarExpanded,
      addSection, removeSection, editSection, setSectionStatus,
      addAnnotation, editAnnotation, removeAnnotation,
    }}>
      {children}
    </PlaybookContext.Provider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/playbook/PlaybookProvider.tsx
git commit -m "feat(playbook): add PlaybookProvider context with state management"
```

---

## Task 4: Route, Layout Integration & Entry Point

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/pages/SetlistsPage.tsx`
- Create: `src/pages/playbook/PlaybookPage.tsx` (skeleton)

- [ ] **Step 1: Create PlaybookPage skeleton**

Create `src/pages/playbook/PlaybookPage.tsx`:

```typescript
import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {type Setlist, type SetlistItem, getSetlists, getSetlistItems} from '@/lib/local-db/setlists';
import {abandonOrphanedSessions} from '@/lib/local-db/playbook';
import {PlaybookProvider} from './PlaybookProvider';

export default function PlaybookPage() {
  const {setlistId} = useParams<{setlistId: string}>();
  const navigate = useNavigate();
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [items, setItems] = useState<SetlistItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      await abandonOrphanedSessions();
      const id = Number(setlistId);
      if (isNaN(id)) {
        navigate('/setlists');
        return;
      }
      const allSetlists = await getSetlists();
      const found = allSetlists.find(s => s.id === id);
      if (!found) {
        navigate('/setlists');
        return;
      }
      const songItems = await getSetlistItems(id);
      if (songItems.length === 0) {
        navigate('/setlists');
        return;
      }
      setSetlist(found);
      setItems(songItems);
      setLoading(false);
    }
    load();
  }, [setlistId, navigate]);

  if (loading || !setlist || !items) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="flex items-center gap-3 text-on-surface-variant text-sm">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading playbook...
        </div>
      </div>
    );
  }

  return (
    <PlaybookProvider setlist={setlist} initialItems={items} initialIndex={0}>
      <div className="flex-1 flex min-h-0 bg-surface">
        {/* Sidebar and main area will be added in Tasks 5-7 */}
        <div className="flex-1 flex items-center justify-center text-on-surface-variant">
          Playbook loaded: {setlist.name} ({items.length} songs)
        </div>
      </div>
    </PlaybookProvider>
  );
}
```

- [ ] **Step 2: Add route to App.tsx**

In `src/App.tsx`, add the import at the top with other page imports:

```typescript
import PlaybookPage from '@/pages/playbook/PlaybookPage';
```

Add the route inside `<Routes>`, after the `/setlists` route:

```typescript
<Route path="/playbook/:setlistId" element={<PlaybookPage />} />
```

- [ ] **Step 3: Hide Layout sidebar on playbook routes**

In `src/components/Layout.tsx`, modify the `Layout` function (line 168):

```typescript
export default function Layout({children}: {children: ReactNode}) {
  const location = useLocation();
  const pathname = location.pathname;
  const isPlaybook = pathname.startsWith('/playbook');

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface">
      {!isPlaybook && <TopNav pathname={pathname} />}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!isPlaybook && <Sidebar pathname={pathname} />}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add Practice button to SetlistsPage**

In `src/pages/SetlistsPage.tsx`, add the import at the top:

```typescript
import {useNavigate} from 'react-router-dom';
import {Play} from 'lucide-react';
```

In the `SetlistEditor` component, add `navigate` and pass `setlist.id`:

Add at the top of `SetlistEditor` function body:

```typescript
const navigate = useNavigate();
```

Replace the header's button area (around line 480) from:

```typescript
<Button size="sm" onClick={onAddSongs}>
  <Plus className="h-4 w-4 mr-1.5" />
  Add Songs
</Button>
```

To:

```typescript
<div className="flex gap-2">
  {items.length > 0 && (
    <Button size="sm" variant="default" onClick={() => navigate(`/playbook/${setlist.id}`)}>
      <Play className="h-4 w-4 mr-1.5" />
      Practice
    </Button>
  )}
  <Button size="sm" variant={items.length > 0 ? 'outline' : 'default'} onClick={onAddSongs}>
    <Plus className="h-4 w-4 mr-1.5" />
    Add Songs
  </Button>
</div>
```

- [ ] **Step 5: Verify navigation works**

Run the app, go to Setlists, select a setlist with songs. Click "Practice". Should navigate to `/playbook/:id` and show the skeleton with setlist name and song count. The app Layout sidebar and top nav should be hidden.

- [ ] **Step 6: Commit**

```bash
git add src/pages/playbook/PlaybookPage.tsx src/App.tsx src/components/Layout.tsx src/pages/SetlistsPage.tsx
git commit -m "feat(playbook): add route, layout integration, and practice button entry point"
```

---

## Task 5: PlaybookTopBar & SongHeader

**Files:**
- Create: `src/pages/playbook/PlaybookTopBar.tsx`
- Create: `src/pages/playbook/SongHeader.tsx`

- [ ] **Step 1: Create PlaybookTopBar**

Create `src/pages/playbook/PlaybookTopBar.tsx`:

```typescript
import {useNavigate} from 'react-router-dom';
import {ArrowLeft, ChevronLeft, ChevronRight} from 'lucide-react';
import {usePlaybook} from './PlaybookProvider';

export default function PlaybookTopBar() {
  const navigate = useNavigate();
  const {setlist, items, activeIndex, prevSong, nextSong} = usePlaybook();

  return (
    <div className="h-14 px-6 flex items-center justify-between bg-surface-container-low/50 backdrop-blur-md shrink-0 z-30">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/setlists`)}
          className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back to Setlist</span>
        </button>
        <div className="h-4 w-px bg-outline-variant/30" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest font-mono">Setlist:</span>
          <span className="text-sm font-semibold text-on-surface">{setlist.name}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={prevSong}
          disabled={activeIndex === 0}
          className="p-1 text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="px-3 py-1 bg-surface-container-high rounded-full font-mono text-xs text-primary">
          {activeIndex + 1} / {items.length}
        </div>
        <button
          onClick={nextSong}
          disabled={activeIndex === items.length - 1}
          className="p-1 text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SongHeader**

Create `src/pages/playbook/SongHeader.tsx`:

```typescript
import {cn} from '@/lib/utils';
import {usePlaybook} from './PlaybookProvider';
import type {ProgressStatus} from '@/lib/local-db/playbook';

const STATUS_CONFIG: Record<ProgressStatus, {label: string; className: string}> = {
  not_started: {label: 'Not Started', className: 'text-outline'},
  needs_work: {label: 'Needs Work', className: 'text-error'},
  practicing: {label: 'Practicing', className: 'text-tertiary'},
  nailed_it: {label: 'Nailed It', className: 'text-green-400'},
};

function getInstrumentBadge(item: {diff_drums?: number | null; diff_guitar?: number | null; diff_bass?: number | null}) {
  // Check what instruments are available to determine badge
  const hasDrums = item.diff_drums != null && item.diff_drums >= 0;
  const hasGuitar = item.diff_guitar != null && item.diff_guitar >= 0;
  const hasBass = item.diff_bass != null && item.diff_bass >= 0;

  if (hasDrums && !hasGuitar && !hasBass) return {label: 'Drum Sheet Music', className: 'bg-tertiary-container/20 text-tertiary'};
  if (hasGuitar) return {label: 'Guitar Tab', className: 'bg-secondary-container/20 text-secondary'};
  if (hasBass) return {label: 'Bass Tab', className: 'bg-secondary-container/20 text-secondary'};
  return {label: 'Chart', className: 'bg-primary-container/20 text-primary'};
}

export default function SongHeader() {
  const {activeItem, songStatus, speed} = usePlaybook();
  if (!activeItem) return null;

  const badge = getInstrumentBadge(activeItem as any);
  const statusConfig = STATUS_CONFIG[songStatus];

  return (
    <div className="px-6 py-4 flex items-end justify-between border-b border-outline-variant/5 shrink-0">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-headline font-extrabold text-on-surface tracking-tighter truncate">
            {activeItem.name}
          </h1>
          <span className={cn('px-2 py-0.5 text-[10px] font-bold uppercase rounded tracking-wider shrink-0 border', badge.className, 'border-current/20')}>
            {badge.label}
          </span>
        </div>
        <p className="text-on-surface-variant font-medium text-sm">
          {activeItem.artist} &middot; {activeItem.charter}
          {speed !== 100 && <span className="text-tertiary ml-2">{speed}% speed</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className={cn('text-sm font-semibold', statusConfig.className)}>
          {statusConfig.label}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/playbook/PlaybookTopBar.tsx src/pages/playbook/SongHeader.tsx
git commit -m "feat(playbook): add top bar with navigation and song header with instrument badges"
```

---

## Task 6: PlaybookSidebar

**Files:**
- Create: `src/pages/playbook/PlaybookSidebar.tsx`

- [ ] **Step 1: Create the sidebar**

Create `src/pages/playbook/PlaybookSidebar.tsx`:

```typescript
import {useState, useRef, useEffect} from 'react';
import {
  ListMusic, LayoutList, Gauge, Volume2, StickyNote,
  Plus, Trash2, ChevronRight, Play, Pause, SkipBack, SkipForward,
  Repeat, Timer,
} from 'lucide-react';
import {cn} from '@/lib/utils';
import {usePlaybook} from './PlaybookProvider';
import {Slider} from '@/components/ui/slider';
import type {ProgressStatus} from '@/lib/local-db/playbook';

const STATUS_DOT: Record<ProgressStatus, string> = {
  not_started: 'bg-outline',
  needs_work: 'bg-error',
  practicing: 'bg-tertiary',
  nailed_it: 'bg-green-400',
};

const STATUS_OPTIONS: {value: ProgressStatus; label: string}[] = [
  {value: 'not_started', label: 'Not Started'},
  {value: 'needs_work', label: 'Needs Work'},
  {value: 'practicing', label: 'Practicing'},
  {value: 'nailed_it', label: 'Nailed It'},
];

const SIDEBAR_PANELS = [
  {id: 'navigator', icon: ListMusic, label: 'Songs'},
  {id: 'sections', icon: LayoutList, label: 'Sections'},
  {id: 'controls', icon: Gauge, label: 'Controls'},
  {id: 'audio', icon: Volume2, label: 'Audio'},
  {id: 'annotations', icon: StickyNote, label: 'Notes'},
] as const;

type PanelId = (typeof SIDEBAR_PANELS)[number]['id'];

// ── Collapsed Icon Strip ────────────────────────────────────────────

function CollapsedSidebar({onExpand}: {onExpand: (panel: PanelId) => void}) {
  return (
    <aside className="w-16 flex flex-col items-center py-4 bg-surface-container-low border-r border-white/5 shrink-0">
      <div className="flex flex-col gap-2 w-full items-center">
        {SIDEBAR_PANELS.map(panel => (
          <button
            key={panel.id}
            onClick={() => onExpand(panel.id)}
            className="p-3 text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-xl transition-all"
            title={panel.label}
          >
            <panel.icon className="h-5 w-5" />
          </button>
        ))}
      </div>
    </aside>
  );
}

// ── Song Navigator Panel ────────────────────────────────────────────

function SongNavigatorPanel() {
  const {items, activeIndex, goToSong, sectionProgress} = usePlaybook();
  // For simplicity, we derive status from the current song's progress only
  // In a full impl, we'd load progress for all songs — but that's V2

  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <button
          key={item.id}
          onClick={() => goToSong(i)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
            i === activeIndex
              ? 'bg-surface-container-high border-l-2 border-primary'
              : 'hover:bg-surface-container',
          )}
        >
          <span className="text-xs font-mono text-outline w-5 text-right tabular-nums shrink-0">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm truncate', i === activeIndex ? 'font-semibold text-on-surface' : 'text-on-surface-variant')}>
              {item.name}
            </p>
            <p className="text-[10px] text-outline truncate">{item.artist}</p>
          </div>
          <div className={cn('w-2 h-2 rounded-full shrink-0', i === activeIndex ? STATUS_DOT[deriveSongStatus()] : 'bg-outline')} />
        </button>
      ))}
    </div>
  );

  function deriveSongStatus(): ProgressStatus {
    if (sectionProgress.length === 0) return 'not_started';
    const statuses = sectionProgress.map(sp => sp.status);
    if (statuses.every(s => s === 'nailed_it')) return 'nailed_it';
    if (statuses.some(s => s === 'needs_work')) return 'needs_work';
    if (statuses.some(s => s === 'practicing' || s === 'nailed_it')) return 'practicing';
    return 'not_started';
  }
}

// ── Sections Panel ──────────────────────────────────────────────────

function SectionsPanel() {
  const {sections, sectionProgress, loopSectionId, setLoopSectionId, setSectionStatus, addSection, removeSection} = usePlaybook();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) nameRef.current?.focus();
  }, [adding]);

  const progressMap = new Map(sectionProgress.map(sp => [sp.songSectionId, sp.status]));

  const handleAdd = async () => {
    if (!newName.trim()) return;
    // Default positions: evenly space sections
    const count = sections.length;
    const start = count / (count + 1);
    const end = (count + 1) / (count + 2);
    await addSection(newName.trim(), start, end);
    setNewName('');
    setAdding(false);
  };

  return (
    <div className="space-y-1">
      {sections.length === 0 && !adding && (
        <p className="text-xs text-outline px-2 py-3">No sections defined. Add sections to track progress.</p>
      )}
      {sections.map(sec => {
        const status = progressMap.get(sec.id) ?? 'not_started';
        const isLooping = loopSectionId === sec.id;
        return (
          <div
            key={sec.id}
            className={cn(
              'group flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all cursor-pointer',
              isLooping
                ? 'bg-surface-container text-primary border-l-2 border-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container',
            )}
          >
            <button className="flex items-center gap-2 flex-1 min-w-0 text-left" onClick={() => setLoopSectionId(isLooping ? null : sec.id)}>
              <div className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[status])} />
              <span className="truncate">{sec.name}</span>
              {isLooping && <Repeat className="h-3 w-3 text-primary shrink-0" />}
            </button>
            <div className="hidden group-hover:flex items-center gap-1 shrink-0">
              <select
                className="text-[10px] bg-surface-container-high rounded px-1 py-0.5 text-on-surface-variant"
                value={status}
                onChange={e => setSectionStatus(sec.id, e.target.value as ProgressStatus)}
                onClick={e => e.stopPropagation()}
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                className="p-0.5 rounded hover:bg-error/10"
                onClick={e => {e.stopPropagation(); removeSection(sec.id);}}
              >
                <Trash2 className="h-3 w-3 text-error" />
              </button>
            </div>
          </div>
        );
      })}
      {adding ? (
        <div className="flex items-center gap-2 px-2">
          <input
            ref={nameRef}
            className="flex-1 text-sm bg-surface-container-high rounded px-2 py-1 text-on-surface outline-none focus:ring-1 focus:ring-primary"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false);}}
            onBlur={() => {if (!newName.trim()) setAdding(false);}}
            placeholder="Section name..."
          />
        </div>
      ) : (
        <button
          className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3" /> Add Section
        </button>
      )}
    </div>
  );
}

// ── Practice Controls Panel ─────────────────────────────────────────

function ControlsPanel() {
  const {speed, setSpeed, isPlaying, togglePlay, loopSectionId, setLoopSectionId} = usePlaybook();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-[11px] font-mono">
          <span className="text-on-surface-variant">SPEED</span>
          <span className="text-primary">{speed}%</span>
        </div>
        <Slider
          value={[speed]}
          onValueChange={([v]) => setSpeed(v)}
          min={5}
          max={200}
          step={5}
        />
      </div>
      <div className="flex items-center justify-around">
        <button className="p-2 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container transition-colors" onClick={() => setSpeed(speed - 5)}>
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-on-primary-container shadow-lg shadow-primary/20 hover:scale-105 transition-transform active:scale-95"
        >
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
        </button>
        <button className="p-2 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container transition-colors" onClick={() => setSpeed(speed + 5)}>
          <SkipForward className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-center justify-between bg-surface-container p-2 rounded-xl">
        <button
          className={cn(
            'p-2 rounded-lg transition-colors',
            loopSectionId ? 'bg-surface-container-highest text-primary' : 'text-on-surface-variant hover:bg-surface-container-highest',
          )}
          onClick={() => setLoopSectionId(loopSectionId ? null : null)}
          title="Loop"
        >
          <Repeat className="h-5 w-5" />
        </button>
        <button className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-highest transition-colors" title="Metronome">
          <Timer className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// ── Audio Panel ─────────────────────────────────────────────────────

function AudioPanel() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-outline">Audio controls adapt to the active chart&apos;s available audio. Full stem isolation coming in V2.</p>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-on-surface">Master Volume</span>
          </div>
          <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
            <div className="h-full bg-primary w-[80%]" />
          </div>
        </div>
        <Volume2 className="h-4 w-4 text-on-surface-variant shrink-0" />
      </div>
    </div>
  );
}

// ── Annotations Panel ───────────────────────────────────────────────

function AnnotationsPanel() {
  const {annotations, sections, addAnnotation, editAnnotation, removeAnnotation} = usePlaybook();
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const handleAdd = async () => {
    const sectionId = selectedSectionId ?? sections[0]?.id;
    if (!sectionId || !newContent.trim()) return;
    await addAnnotation(sectionId, newContent.trim());
    setNewContent('');
    setAdding(false);
  };

  const sectionMap = new Map(sections.map(s => [s.id, s.name]));

  return (
    <div className="space-y-3">
      {annotations.length === 0 && !adding && (
        <p className="text-xs text-outline px-2 py-3">No annotations yet. Add notes to help you remember practice insights.</p>
      )}
      {annotations.map(ann => (
        <div key={ann.id} className="group p-3 bg-surface-container-high/40 rounded-xl border border-outline-variant/10">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-on-surface-variant leading-relaxed flex-1">{ann.content}</p>
            <button
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-error/10 transition-opacity shrink-0"
              onClick={() => removeAnnotation(ann.id)}
            >
              <Trash2 className="h-3 w-3 text-error" />
            </button>
          </div>
          <span className="text-[10px] text-outline mt-1 block">
            {sectionMap.get(ann.songSectionId) ?? 'Unknown section'}
          </span>
        </div>
      ))}
      {adding ? (
        <div className="space-y-2">
          {sections.length > 0 && (
            <select
              className="w-full text-xs bg-surface-container-high rounded px-2 py-1 text-on-surface-variant"
              value={selectedSectionId ?? sections[0]?.id ?? ''}
              onChange={e => setSelectedSectionId(Number(e.target.value))}
            >
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <textarea
            ref={inputRef}
            className="w-full text-xs bg-surface-container-high rounded px-2 py-1.5 text-on-surface outline-none focus:ring-1 focus:ring-primary resize-none"
            rows={3}
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            onKeyDown={e => {if (e.key === 'Enter' && e.metaKey) handleAdd(); if (e.key === 'Escape') setAdding(false);}}
            placeholder="Write your note..."
          />
          <div className="flex gap-2">
            <button className="text-[11px] text-on-surface-variant hover:text-on-surface" onClick={() => setAdding(false)}>Cancel</button>
            <button className="text-[11px] text-primary font-bold" onClick={handleAdd}>Save</button>
          </div>
        </div>
      ) : (
        <button
          className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-on-surface-variant hover:text-on-surface transition-colors"
          onClick={() => {setAdding(true); setSelectedSectionId(sections[0]?.id ?? null);}}
          disabled={sections.length === 0}
          title={sections.length === 0 ? 'Add a section first' : undefined}
        >
          <Plus className="h-3 w-3" /> Add Annotation
        </button>
      )}
    </div>
  );
}

// ── Main Sidebar ────────────────────────────────────────────────────

const PANEL_COMPONENTS: Record<PanelId, () => JSX.Element> = {
  navigator: SongNavigatorPanel,
  sections: SectionsPanel,
  controls: ControlsPanel,
  audio: AudioPanel,
  annotations: AnnotationsPanel,
};

export default function PlaybookSidebar() {
  const {sidebarExpanded, setSidebarExpanded} = usePlaybook();
  const [activePanel, setActivePanel] = useState<PanelId>('navigator');

  if (!sidebarExpanded) {
    return <CollapsedSidebar onExpand={(panel) => {setActivePanel(panel); setSidebarExpanded(true);}} />;
  }

  return (
    <aside className="w-72 bg-surface-container-low border-r border-white/5 flex flex-col shrink-0 overflow-hidden">
      {/* Panel tabs */}
      <div className="flex border-b border-white/5 shrink-0">
        {SIDEBAR_PANELS.map(panel => (
          <button
            key={panel.id}
            onClick={() => setActivePanel(panel.id)}
            className={cn(
              'flex-1 py-3 flex items-center justify-center transition-colors',
              activePanel === panel.id
                ? 'text-primary bg-surface-container'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50',
            )}
            title={panel.label}
          >
            <panel.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <h3 className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold font-mono">
          {SIDEBAR_PANELS.find(p => p.id === activePanel)?.label}
        </h3>
      </div>
      {/* Panel content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {(() => {
          const Panel = PANEL_COMPONENTS[activePanel];
          return <Panel />;
        })()}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/playbook/PlaybookSidebar.tsx
git commit -m "feat(playbook): add collapsible sidebar with navigator, sections, controls, audio, annotations panels"
```

---

## Task 7: ChartViewer & PlaybackControls

**Files:**
- Create: `src/pages/playbook/ChartViewer.tsx`
- Create: `src/pages/playbook/PlaybackControls.tsx`

- [ ] **Step 1: Create ChartViewer adapter**

Create `src/pages/playbook/ChartViewer.tsx`:

```typescript
import {usePlaybook} from './PlaybookProvider';

/**
 * Adapter that renders the appropriate chart viewer based on the active song's data.
 * V1: Shows chart metadata and a placeholder for the renderer integration.
 * The actual renderers (AlphaTab, SheetMusic) will be wired in as follow-up work
 * since they require significant state management (audio files, parsed chart data, etc.)
 * that is loaded differently per renderer.
 */
export default function ChartViewer() {
  const {activeItem, speed, isPlaying, loopSectionId, sections} = usePlaybook();
  if (!activeItem) return null;

  const loopedSection = sections.find(s => s.id === loopSectionId);

  return (
    <div className="flex-1 relative overflow-y-auto bg-surface-container-lowest flex flex-col">
      {/* Loop indicator */}
      {loopedSection && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-primary/20 backdrop-blur-md px-4 py-1.5 rounded-full flex items-center gap-2 border border-primary/30">
          <span className="text-xs font-bold text-primary font-mono">LOOPING: {loopedSection.name}</span>
        </div>
      )}

      {/* Chart renderer placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center px-12 py-8">
        <div className="w-full max-w-4xl space-y-8">
          {/* Song info card */}
          <div className="bg-surface-container-low/30 p-8 rounded-2xl border border-outline-variant/5">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-4 text-on-surface-variant">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-on-surface-variant">Speed</span>
                  <span className="text-2xl font-mono font-bold text-primary">{speed}%</span>
                </div>
                <div className="w-px h-8 bg-outline-variant/20" />
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-on-surface-variant">Status</span>
                  <span className="text-2xl font-mono font-bold text-secondary">{isPlaying ? 'Playing' : 'Paused'}</span>
                </div>
              </div>
              <p className="text-sm text-outline max-w-md mx-auto">
                Chart renderer will display {activeItem.name} here. The existing AlphaTab and Sheet Music renderers will be integrated to display the actual notation.
              </p>
              <div className="text-xs text-outline font-mono">
                MD5: {activeItem.chartMd5}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Page turn affordances */}
      <PageTurnAffordances />

      {/* Playback progress bar */}
      <div className="h-1 bg-surface-container-highest shrink-0">
        <div className="h-full bg-primary shadow-[0_0_12px_rgba(198,191,255,0.6)] transition-all" style={{width: '0%'}} />
      </div>
    </div>
  );
}

function PageTurnAffordances() {
  const {prevSong, nextSong, activeIndex, items} = usePlaybook();

  return (
    <>
      {activeIndex > 0 && (
        <button
          onClick={prevSong}
          className="absolute left-0 top-0 h-full w-12 bg-gradient-to-r from-black/40 to-transparent flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <span className="text-surface-variant text-2xl">‹</span>
        </button>
      )}
      {activeIndex < items.length - 1 && (
        <button
          onClick={nextSong}
          className="absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-black/40 to-transparent flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <span className="text-surface-variant text-2xl">›</span>
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 2: Create PlaybackControls**

Create `src/pages/playbook/PlaybackControls.tsx`:

```typescript
import {Play, Pause, SkipBack, SkipForward, Repeat, Timer} from 'lucide-react';
import {cn} from '@/lib/utils';
import {usePlaybook} from './PlaybookProvider';

/**
 * Floating glassmorphism playback controls that appear when the sidebar is collapsed.
 */
export default function PlaybackControls() {
  const {
    sidebarExpanded, isPlaying, togglePlay,
    prevSong, nextSong, activeIndex, items,
    speed, loopSectionId,
  } = usePlaybook();

  // Only show when sidebar is collapsed
  if (sidebarExpanded) return null;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
      <div className="glass-panel border border-white/10 rounded-full px-8 py-3 flex items-center gap-8 shadow-studio-xl">
        {/* Transport */}
        <div className="flex items-center gap-4">
          <button
            onClick={prevSong}
            disabled={activeIndex === 0}
            className="text-on-surface-variant hover:text-on-surface disabled:opacity-30 transition-colors"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-on-primary-container shadow-lg shadow-primary/20 active:scale-95 transition-transform"
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
          </button>
          <button
            onClick={nextSong}
            disabled={activeIndex === items.length - 1}
            className="text-on-surface-variant hover:text-on-surface disabled:opacity-30 transition-colors"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>

        <div className="h-8 w-px bg-outline-variant/30" />

        {/* Toggles */}
        <div className="flex items-center gap-4">
          <button className={cn('transition-colors', loopSectionId ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface')}>
            <Repeat className="h-5 w-5" />
          </button>
          <button className="text-on-surface-variant hover:text-on-surface transition-colors">
            <Timer className="h-5 w-5" />
          </button>
        </div>

        <div className="h-8 w-px bg-outline-variant/30" />

        {/* Speed indicator */}
        <span className="text-xs font-mono text-primary font-bold">{speed}%</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/playbook/ChartViewer.tsx src/pages/playbook/PlaybackControls.tsx
git commit -m "feat(playbook): add chart viewer adapter and floating playback controls"
```

---

## Task 8: Assemble PlaybookPage & Keyboard Shortcuts

**Files:**
- Modify: `src/pages/playbook/PlaybookPage.tsx`

- [ ] **Step 1: Wire everything together in PlaybookPage**

Replace the placeholder content in `src/pages/playbook/PlaybookPage.tsx`. Update the return inside `PlaybookProvider`:

```typescript
import {useEffect, useState, useCallback} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {type Setlist, type SetlistItem, getSetlists, getSetlistItems} from '@/lib/local-db/setlists';
import {abandonOrphanedSessions} from '@/lib/local-db/playbook';
import {PlaybookProvider, usePlaybook} from './PlaybookProvider';
import PlaybookSidebar from './PlaybookSidebar';
import PlaybookTopBar from './PlaybookTopBar';
import SongHeader from './SongHeader';
import ChartViewer from './ChartViewer';
import PlaybackControls from './PlaybackControls';

function PlaybookShell() {
  const {
    nextSong, prevSong, togglePlay, toggleSidebar,
    setLoopSectionId, loopSectionId,
    speed, setSpeed, sections,
  } = usePlaybook();

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't capture when typing in inputs
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case 'ArrowRight': nextSong(); break;
      case 'ArrowLeft': prevSong(); break;
      case ' ': e.preventDefault(); togglePlay(); break;
      case '[': toggleSidebar(); break;
      case 'l': setLoopSectionId(loopSectionId ? null : (sections[0]?.id ?? null)); break;
      case '+': case '=': setSpeed(speed + 5); break;
      case '-': setSpeed(speed - 5); break;
      case 'Escape': window.history.back(); break;
      default:
        // Number keys 1-9 to jump to sections
        if (e.key >= '1' && e.key <= '9') {
          const idx = parseInt(e.key) - 1;
          if (sections[idx]) setLoopSectionId(sections[idx].id);
        }
    }
  }, [nextSong, prevSong, togglePlay, toggleSidebar, setLoopSectionId, loopSectionId, speed, setSpeed, sections]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex-1 flex min-h-0">
      <PlaybookSidebar />
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        <PlaybookTopBar />
        <SongHeader />
        <ChartViewer />
        <PlaybackControls />
      </div>
    </div>
  );
}

export default function PlaybookPage() {
  const {setlistId} = useParams<{setlistId: string}>();
  const navigate = useNavigate();
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [items, setItems] = useState<SetlistItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      await abandonOrphanedSessions();
      const id = Number(setlistId);
      if (isNaN(id)) {
        navigate('/setlists');
        return;
      }
      const allSetlists = await getSetlists();
      const found = allSetlists.find(s => s.id === id);
      if (!found) {
        navigate('/setlists');
        return;
      }
      const songItems = await getSetlistItems(id);
      if (songItems.length === 0) {
        navigate('/setlists');
        return;
      }
      setSetlist(found);
      setItems(songItems);
      setLoading(false);
    }
    load();
  }, [setlistId, navigate]);

  if (loading || !setlist || !items) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="flex items-center gap-3 text-on-surface-variant text-sm">
          <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading playbook...
        </div>
      </div>
    );
  }

  return (
    <PlaybookProvider setlist={setlist} initialItems={items} initialIndex={0}>
      <PlaybookShell />
    </PlaybookProvider>
  );
}
```

- [ ] **Step 2: Verify the full playbook works end-to-end**

Run the app. Navigate to Setlists → select a setlist with songs → click "Practice".

Expected:
- Layout sidebar and top nav are hidden
- Playbook shows with sidebar (song navigator, sections, controls)
- Top bar shows setlist name and song counter
- Song header shows active song name, artist, instrument badge
- Chart area shows placeholder with speed and status
- Can navigate between songs with arrows or sidebar clicks
- Can toggle sidebar with `[` key
- Can add/remove sections
- Can add annotations (after adding at least one section)
- Floating playback controls appear when sidebar is collapsed

- [ ] **Step 3: Commit**

```bash
git add src/pages/playbook/PlaybookPage.tsx
git commit -m "feat(playbook): assemble full playbook page with keyboard shortcuts"
```

---

## Summary

| Task | What it does | Files |
|------|-------------|-------|
| 1 | Database migration (4 tables, indexes) | migration, types |
| 2 | Data access layer (CRUD for all tables) | playbook.ts |
| 3 | PlaybookProvider (React context + state) | PlaybookProvider.tsx |
| 4 | Route, Layout hiding, Practice button | App.tsx, Layout.tsx, SetlistsPage.tsx |
| 5 | Top bar + Song header | PlaybookTopBar.tsx, SongHeader.tsx |
| 6 | Collapsible sidebar (5 panels) | PlaybookSidebar.tsx |
| 7 | Chart viewer adapter + floating controls | ChartViewer.tsx, PlaybackControls.tsx |
| 8 | Assemble page + keyboard shortcuts | PlaybookPage.tsx |

**Follow-up work (not in this plan):** Wire actual AlphaTab/SheetMusic renderers into ChartViewer, audio playback integration with AudioManager, stem isolation, metronome, song transition animations.
