# Lessons & Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-directed practice program system with programs, units, goals (linked items), scheduled sessions, a calendar view, and an in-app reminder widget on the Learn hub.

**Architecture:** Program-first — programs own ordered units, units own ordered goals (linked items with targets), sessions are scheduled practice blocks linked optionally to a unit. All data lives in SQLite via Kysely. UI adds four new pages (`/programs`, `/programs/:id`, `/programs/:id/units/:unitId`, `/calendar`) and one widget on the existing `/learn` page.

**Tech Stack:** React, TypeScript, Kysely (SQLite), Tailwind CSS (Material You tokens), React Router v6, Lucide icons, shadcn/ui (Button, Input, Dialog, Select, Badge)

---

## Task 1: DB Types + Migration

**Files:**
- Modify: `src/lib/local-db/types.ts` (add 4 interfaces + 4 DB entries)
- Create: `src/lib/local-db/migrations/036_practice_programs.ts`
- Modify: `src/lib/local-db/migrations/index.ts`

- [ ] **Step 1: Add four interfaces to `src/lib/local-db/types.ts`**

Add after the `LearnDailyGoal` interface (around line 415):

```typescript
export interface PracticeProgram {
  id: Generated<number>;
  title: string;
  description: string | null;
  instrument: string | null;
  status: string;          // 'draft' | 'active' | 'archived'
  started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramUnit {
  id: Generated<number>;
  program_id: number;
  title: string;
  description: string | null;
  order_index: number;
  suggested_days: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface UnitGoal {
  id: Generated<number>;
  unit_id: number;
  title: string;
  type: string;            // 'song' | 'tab' | 'learn_lesson' | 'exercise' | 'custom'
  ref_id: string | null;
  target: string | null;
  notes: string | null;
  order_index: number;
  completed_at: string | null;
  created_at: string;
}

export interface PracticeSession {
  id: Generated<number>;
  title: string | null;
  unit_id: number | null;
  scheduled_date: string;  // YYYY-MM-DD
  scheduled_time: string | null;
  duration_minutes: number | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Register the four new tables in the `DB` interface**

In `src/lib/local-db/types.ts`, find the `export interface DB {` block (around line 416) and add before the closing `}`:

```typescript
  practice_programs: PracticeProgram;
  program_units: ProgramUnit;
  unit_goals: UnitGoal;
  practice_sessions: PracticeSession;
```

- [ ] **Step 3: Create migration file**

Create `src/lib/local-db/migrations/036_practice_programs.ts`:

```typescript
import {type Kysely, type Migration} from 'kysely';

export const migration_036_practice_programs: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('practice_programs')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('title', 'text', cb => cb.notNull())
      .addColumn('description', 'text')
      .addColumn('instrument', 'text')
      .addColumn('status', 'text', cb => cb.notNull().defaultTo('draft'))
      .addColumn('started_at', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .addColumn('updated_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createTable('program_units')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('program_id', 'integer', cb => cb.notNull().references('practice_programs.id'))
      .addColumn('title', 'text', cb => cb.notNull())
      .addColumn('description', 'text')
      .addColumn('order_index', 'integer', cb => cb.notNull())
      .addColumn('suggested_days', 'integer')
      .addColumn('started_at', 'text')
      .addColumn('completed_at', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createTable('unit_goals')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('unit_id', 'integer', cb => cb.notNull().references('program_units.id'))
      .addColumn('title', 'text', cb => cb.notNull())
      .addColumn('type', 'text', cb => cb.notNull().defaultTo('custom'))
      .addColumn('ref_id', 'text')
      .addColumn('target', 'text')
      .addColumn('notes', 'text')
      .addColumn('order_index', 'integer', cb => cb.notNull().defaultTo(0))
      .addColumn('completed_at', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createTable('practice_sessions')
      .ifNotExists()
      .addColumn('id', 'integer', cb => cb.primaryKey().autoIncrement().notNull())
      .addColumn('title', 'text')
      .addColumn('unit_id', 'integer', cb => cb.references('program_units.id'))
      .addColumn('scheduled_date', 'text', cb => cb.notNull())
      .addColumn('scheduled_time', 'text')
      .addColumn('duration_minutes', 'integer')
      .addColumn('completed_at', 'text')
      .addColumn('notes', 'text')
      .addColumn('created_at', 'text', cb => cb.notNull())
      .execute();

    await db.schema
      .createIndex('idx_practice_sessions_date')
      .ifNotExists()
      .on('practice_sessions')
      .columns(['scheduled_date'])
      .execute();

    await db.schema
      .createIndex('idx_program_units_program')
      .ifNotExists()
      .on('program_units')
      .columns(['program_id', 'order_index'])
      .execute();

    await db.schema
      .createIndex('idx_unit_goals_unit')
      .ifNotExists()
      .on('unit_goals')
      .columns(['unit_id', 'order_index'])
      .execute();
  },

  async down(db: Kysely<any>) {
    await db.schema.dropIndex('idx_unit_goals_unit').ifExists().execute();
    await db.schema.dropIndex('idx_program_units_program').ifExists().execute();
    await db.schema.dropIndex('idx_practice_sessions_date').ifExists().execute();
    await db.schema.dropTable('practice_sessions').ifExists().execute();
    await db.schema.dropTable('unit_goals').ifExists().execute();
    await db.schema.dropTable('program_units').ifExists().execute();
    await db.schema.dropTable('practice_programs').ifExists().execute();
  },
};
```

- [ ] **Step 4: Register migration in `src/lib/local-db/migrations/index.ts`**

Add import at the top with the other migration imports:
```typescript
import {migration_036_practice_programs} from './036_practice_programs';
```

Add to the exported object (after the `035_learn_schema_fixes` entry):
```typescript
  '036_practice_programs': migration_036_practice_programs,
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/local-db/types.ts src/lib/local-db/migrations/036_practice_programs.ts src/lib/local-db/migrations/index.ts
git commit -m "feat(db): add practice programs schema — migration 036"
```

---

## Task 2: DB Access Layer + Tests

**Files:**
- Create: `src/lib/local-db/programs.ts`
- Create: `src/lib/local-db/__tests__/programs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/local-db/__tests__/programs.test.ts`:

```typescript
import {describe, it, expect, vi, beforeEach} from 'vitest';

// ── query builder mock ───────────────────────────────────────────────────────

function makeQueryBuilder(resolvedValue: unknown = undefined) {
  const self: Record<string, (...args: unknown[]) => unknown> = {};
  const chain = () => self;
  self.values = vi.fn(chain);
  self.set = vi.fn(chain);
  self.where = vi.fn(chain);
  self.select = vi.fn(chain);
  self.selectAll = vi.fn(chain);
  self.limit = vi.fn(chain);
  self.orderBy = vi.fn(chain);
  self.execute = vi.fn(() => Promise.resolve(resolvedValue ?? []));
  self.executeTakeFirst = vi.fn(() => Promise.resolve(resolvedValue ?? null));
  return self;
}

function makeDbMock(opts: {
  insertId?: number;
  selectRows?: unknown;
  selectOne?: unknown;
} = {}) {
  const insertBuilder = makeQueryBuilder({insertId: opts.insertId ?? 1});
  const selectBuilder = makeQueryBuilder(opts.selectOne ?? null);
  if (opts.selectRows !== undefined) {
    selectBuilder.execute = vi.fn(() => Promise.resolve(opts.selectRows));
  }
  const updateBuilder = makeQueryBuilder();
  const deleteBuilder = makeQueryBuilder();

  const db = {
    insertInto: vi.fn(() => insertBuilder),
    selectFrom: vi.fn(() => selectBuilder),
    updateTable: vi.fn(() => updateBuilder),
    deleteFrom: vi.fn(() => deleteBuilder),
    _insertBuilder: insertBuilder,
    _selectBuilder: selectBuilder,
    _updateBuilder: updateBuilder,
    _deleteBuilder: deleteBuilder,
  };
  return db;
}

vi.mock('../client', () => ({getLocalDb: vi.fn()}));

import {getLocalDb} from '../client';
import {
  getPrograms,
  getActiveProgram,
  getProgram,
  createProgram,
  activateProgram,
  archiveProgram,
  getUnitsForProgram,
  createUnit,
  completeUnit,
  deleteUnit,
  getGoalsForUnit,
  createGoal,
  completeGoal,
  uncompleteGoal,
  deleteGoal,
  getSessionsForDateRange,
  getUpcomingSessions,
  createSession,
  completeSession,
  deleteSession,
} from '../programs';

const mockGet = vi.mocked(getLocalDb);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── programs ─────────────────────────────────────────────────────────────────

const PROGRAM_ROW = {
  id: 1, title: 'My Program', description: null, instrument: 'guitar',
  status: 'draft', started_at: null,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};

describe('getPrograms', () => {
  it('returns programs mapped to camelCase', async () => {
    const db = makeDbMock({selectRows: [PROGRAM_ROW]});
    mockGet.mockResolvedValue(db as any);
    const result = await getPrograms();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({id: 1, title: 'My Program', instrument: 'guitar', status: 'draft'});
  });
});

describe('getActiveProgram', () => {
  it('returns null when none active', async () => {
    const db = makeDbMock();
    db._selectBuilder.executeTakeFirst = vi.fn(() => Promise.resolve(null));
    mockGet.mockResolvedValue(db as any);
    expect(await getActiveProgram()).toBeNull();
  });

  it('filters by status=active', async () => {
    const db = makeDbMock();
    db._selectBuilder.executeTakeFirst = vi.fn(() => Promise.resolve({...PROGRAM_ROW, status: 'active'}));
    mockGet.mockResolvedValue(db as any);
    const result = await getActiveProgram();
    expect(result?.status).toBe('active');
    expect(db._selectBuilder.where).toHaveBeenCalledWith('status', '=', 'active');
  });
});

describe('getProgram', () => {
  it('returns null when not found', async () => {
    const db = makeDbMock();
    db._selectBuilder.executeTakeFirst = vi.fn(() => Promise.resolve(null));
    mockGet.mockResolvedValue(db as any);
    expect(await getProgram(99)).toBeNull();
  });
});

describe('createProgram', () => {
  it('inserts with status=draft and returns insertId', async () => {
    const db = makeDbMock({insertId: 5});
    mockGet.mockResolvedValue(db as any);
    const id = await createProgram({title: 'New Program', instrument: 'guitar'});
    expect(id).toBe(5);
    expect(db._insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({title: 'New Program', status: 'draft', instrument: 'guitar'}),
    );
  });
});

describe('activateProgram', () => {
  it('calls updateTable twice — deactivate then activate', async () => {
    const db = makeDbMock();
    mockGet.mockResolvedValue(db as any);
    await activateProgram(3);
    expect(db.updateTable).toHaveBeenCalledTimes(2);
    expect(db._updateBuilder.where).toHaveBeenCalledWith('status', '=', 'active');
    expect(db._updateBuilder.where).toHaveBeenCalledWith('id', '=', 3);
  });
});

describe('archiveProgram', () => {
  it('sets status to archived', async () => {
    const db = makeDbMock();
    mockGet.mockResolvedValue(db as any);
    await archiveProgram(1);
    expect(db._updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({status: 'archived'}),
    );
  });
});

// ── units ─────────────────────────────────────────────────────────────────────

describe('getUnitsForProgram', () => {
  it('filters by programId and orders by order_index asc', async () => {
    const db = makeDbMock({selectRows: []});
    mockGet.mockResolvedValue(db as any);
    await getUnitsForProgram(2);
    expect(db._selectBuilder.where).toHaveBeenCalledWith('program_id', '=', 2);
    expect(db._selectBuilder.orderBy).toHaveBeenCalledWith('order_index', 'asc');
  });
});

describe('completeUnit', () => {
  it('sets completed_at for the given id', async () => {
    const db = makeDbMock();
    mockGet.mockResolvedValue(db as any);
    await completeUnit(7);
    expect(db._updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({completed_at: expect.any(String)}),
    );
    expect(db._updateBuilder.where).toHaveBeenCalledWith('id', '=', 7);
  });
});

describe('deleteUnit', () => {
  it('deletes from program_units by id', async () => {
    const db = makeDbMock();
    mockGet.mockResolvedValue(db as any);
    await deleteUnit(4);
    expect(db.deleteFrom).toHaveBeenCalledWith('program_units');
    expect(db._deleteBuilder.where).toHaveBeenCalledWith('id', '=', 4);
  });
});

// ── goals ──────────────────────────────────────────────────────────────────────

describe('getGoalsForUnit', () => {
  it('filters by unitId and orders by order_index', async () => {
    const db = makeDbMock({selectRows: []});
    mockGet.mockResolvedValue(db as any);
    await getGoalsForUnit(3);
    expect(db._selectBuilder.where).toHaveBeenCalledWith('unit_id', '=', 3);
    expect(db._selectBuilder.orderBy).toHaveBeenCalledWith('order_index', 'asc');
  });
});

describe('completeGoal', () => {
  it('sets completed_at', async () => {
    const db = makeDbMock();
    mockGet.mockResolvedValue(db as any);
    await completeGoal(10);
    expect(db._updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({completed_at: expect.any(String)}),
    );
    expect(db._updateBuilder.where).toHaveBeenCalledWith('id', '=', 10);
  });
});

describe('uncompleteGoal', () => {
  it('sets completed_at to null', async () => {
    const db = makeDbMock();
    mockGet.mockResolvedValue(db as any);
    await uncompleteGoal(10);
    expect(db._updateBuilder.set).toHaveBeenCalledWith({completed_at: null});
    expect(db._updateBuilder.where).toHaveBeenCalledWith('id', '=', 10);
  });
});

// ── sessions ──────────────────────────────────────────────────────────────────

describe('getSessionsForDateRange', () => {
  it('applies >=from and <=to filters', async () => {
    const db = makeDbMock({selectRows: []});
    mockGet.mockResolvedValue(db as any);
    await getSessionsForDateRange('2026-04-01', '2026-04-30');
    expect(db._selectBuilder.where).toHaveBeenCalledWith('scheduled_date', '>=', '2026-04-01');
    expect(db._selectBuilder.where).toHaveBeenCalledWith('scheduled_date', '<=', '2026-04-30');
  });
});

describe('createSession', () => {
  it('inserts and returns id', async () => {
    const db = makeDbMock({insertId: 9});
    mockGet.mockResolvedValue(db as any);
    const id = await createSession({scheduledDate: '2026-04-27'});
    expect(id).toBe(9);
    expect(db._insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({scheduled_date: '2026-04-27'}),
    );
  });
});

describe('completeSession', () => {
  it('sets completed_at and notes', async () => {
    const db = makeDbMock();
    mockGet.mockResolvedValue(db as any);
    await completeSession(4, 'Great session!');
    expect(db._updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({notes: 'Great session!', completed_at: expect.any(String)}),
    );
    expect(db._updateBuilder.where).toHaveBeenCalledWith('id', '=', 4);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npx vitest run src/lib/local-db/__tests__/programs.test.ts
```

Expected: all tests fail with "Cannot find module '../programs'"

- [ ] **Step 3: Create `src/lib/local-db/programs.ts`**

```typescript
import {getLocalDb} from './client';
import type {DB} from './types';
import type {Kysely} from 'kysely';

// ── Domain types ──────────────────────────────────────────────────────────────

export interface Program {
  id: number;
  title: string;
  description: string | null;
  instrument: string | null;
  status: 'draft' | 'active' | 'archived';
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: number;
  programId: number;
  title: string;
  description: string | null;
  orderIndex: number;
  suggestedDays: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Goal {
  id: number;
  unitId: number;
  title: string;
  type: 'song' | 'tab' | 'learn_lesson' | 'exercise' | 'custom';
  refId: string | null;
  target: string | null;
  notes: string | null;
  orderIndex: number;
  completedAt: string | null;
  createdAt: string;
}

export interface Session {
  id: number;
  title: string | null;
  unitId: number | null;
  scheduledDate: string;
  scheduledTime: string | null;
  durationMinutes: number | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

type ProgramRow = DB['practice_programs'] & {id: number};
type UnitRow = DB['program_units'] & {id: number};
type GoalRow = DB['unit_goals'] & {id: number};
type SessionRow = DB['practice_sessions'] & {id: number};

function rowToProgram(row: ProgramRow): Program {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    instrument: row.instrument,
    status: row.status as Program['status'],
    startedAt: row.started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUnit(row: UnitRow): Unit {
  return {
    id: row.id,
    programId: row.program_id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
    suggestedDays: row.suggested_days,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    unitId: row.unit_id,
    title: row.title,
    type: row.type as Goal['type'],
    refId: row.ref_id,
    target: row.target,
    notes: row.notes,
    orderIndex: row.order_index,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    unitId: row.unit_id,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    durationMinutes: row.duration_minutes,
    completedAt: row.completed_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// ── Programs ──────────────────────────────────────────────────────────────────

export async function getPrograms(): Promise<Program[]> {
  const db = await getLocalDb();
  const rows = await db.selectFrom('practice_programs').selectAll().execute();
  return (rows as ProgramRow[]).map(rowToProgram);
}

export async function getActiveProgram(): Promise<Program | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('practice_programs')
    .selectAll()
    .where('status', '=', 'active')
    .executeTakeFirst();
  return row ? rowToProgram(row as ProgramRow) : null;
}

export async function getProgram(id: number): Promise<Program | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('practice_programs')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row ? rowToProgram(row as ProgramRow) : null;
}

export async function createProgram(data: {
  title: string;
  description?: string;
  instrument?: string;
}): Promise<number> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const result = await db
    .insertInto('practice_programs')
    .values({
      title: data.title,
      description: data.description ?? null,
      instrument: data.instrument ?? null,
      status: 'draft',
      started_at: null,
      created_at: now,
      updated_at: now,
    })
    .executeTakeFirst();
  return Number(result?.insertId ?? 0);
}

export async function updateProgram(
  id: number,
  data: Partial<{title: string; description: string; instrument: string}>,
): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await db
    .updateTable('practice_programs')
    .set({...data, updated_at: now})
    .where('id', '=', id)
    .execute();
}

export async function activateProgram(id: number): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await db
    .updateTable('practice_programs')
    .set({status: 'draft', updated_at: now})
    .where('status', '=', 'active')
    .execute();
  await db
    .updateTable('practice_programs')
    .set({status: 'active', started_at: now, updated_at: now})
    .where('id', '=', id)
    .execute();
}

export async function archiveProgram(id: number): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  await db
    .updateTable('practice_programs')
    .set({status: 'archived', updated_at: now})
    .where('id', '=', id)
    .execute();
}

// ── Units ─────────────────────────────────────────────────────────────────────

export async function getUnitsForProgram(programId: number): Promise<Unit[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('program_units')
    .selectAll()
    .where('program_id', '=', programId)
    .orderBy('order_index', 'asc')
    .execute();
  return (rows as UnitRow[]).map(rowToUnit);
}

export async function getUnit(id: number): Promise<Unit | null> {
  const db = await getLocalDb();
  const row = await db
    .selectFrom('program_units')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row ? rowToUnit(row as UnitRow) : null;
}

export async function createUnit(data: {
  programId: number;
  title: string;
  description?: string;
  suggestedDays?: number;
}): Promise<number> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const last = await db
    .selectFrom('program_units')
    .select('order_index')
    .where('program_id', '=', data.programId)
    .orderBy('order_index', 'desc')
    .limit(1)
    .executeTakeFirst();
  const orderIndex = last ? (last.order_index as number) + 1 : 0;
  const result = await db
    .insertInto('program_units')
    .values({
      program_id: data.programId,
      title: data.title,
      description: data.description ?? null,
      order_index: orderIndex,
      suggested_days: data.suggestedDays ?? null,
      started_at: null,
      completed_at: null,
      created_at: now,
    })
    .executeTakeFirst();
  return Number(result?.insertId ?? 0);
}

export async function updateUnit(
  id: number,
  data: Partial<{title: string; description: string; suggestedDays: number}>,
): Promise<void> {
  const db = await getLocalDb();
  const mapped: Record<string, unknown> = {};
  if (data.title !== undefined) mapped.title = data.title;
  if (data.description !== undefined) mapped.description = data.description;
  if (data.suggestedDays !== undefined) mapped.suggested_days = data.suggestedDays;
  await db.updateTable('program_units').set(mapped).where('id', '=', id).execute();
}

export async function startUnit(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('program_units')
    .set({started_at: new Date().toISOString()})
    .where('id', '=', id)
    .execute();
}

export async function completeUnit(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('program_units')
    .set({completed_at: new Date().toISOString()})
    .where('id', '=', id)
    .execute();
}

export async function deleteUnit(id: number): Promise<void> {
  const db = await getLocalDb();
  await (db as any).deleteFrom('program_units').where('id', '=', id).execute();
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export async function getGoalsForUnit(unitId: number): Promise<Goal[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('unit_goals')
    .selectAll()
    .where('unit_id', '=', unitId)
    .orderBy('order_index', 'asc')
    .execute();
  return (rows as GoalRow[]).map(rowToGoal);
}

export async function createGoal(data: {
  unitId: number;
  title: string;
  type?: Goal['type'];
  refId?: string;
  target?: string;
  notes?: string;
}): Promise<number> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const last = await db
    .selectFrom('unit_goals')
    .select('order_index')
    .where('unit_id', '=', data.unitId)
    .orderBy('order_index', 'desc')
    .limit(1)
    .executeTakeFirst();
  const orderIndex = last ? (last.order_index as number) + 1 : 0;
  const result = await db
    .insertInto('unit_goals')
    .values({
      unit_id: data.unitId,
      title: data.title,
      type: data.type ?? 'custom',
      ref_id: data.refId ?? null,
      target: data.target ?? null,
      notes: data.notes ?? null,
      order_index: orderIndex,
      completed_at: null,
      created_at: now,
    })
    .executeTakeFirst();
  return Number(result?.insertId ?? 0);
}

export async function updateGoal(
  id: number,
  data: Partial<{title: string; target: string | null; notes: string | null}>,
): Promise<void> {
  const db = await getLocalDb();
  await db.updateTable('unit_goals').set(data).where('id', '=', id).execute();
}

export async function completeGoal(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('unit_goals')
    .set({completed_at: new Date().toISOString()})
    .where('id', '=', id)
    .execute();
}

export async function uncompleteGoal(id: number): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('unit_goals')
    .set({completed_at: null})
    .where('id', '=', id)
    .execute();
}

export async function deleteGoal(id: number): Promise<void> {
  const db = await getLocalDb();
  await (db as any).deleteFrom('unit_goals').where('id', '=', id).execute();
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessionsForDateRange(from: string, to: string): Promise<Session[]> {
  const db = await getLocalDb();
  const rows = await db
    .selectFrom('practice_sessions')
    .selectAll()
    .where('scheduled_date', '>=', from)
    .where('scheduled_date', '<=', to)
    .orderBy('scheduled_date', 'asc')
    .execute();
  return (rows as SessionRow[]).map(rowToSession);
}

export async function getSessionsForDate(date: string): Promise<Session[]> {
  return getSessionsForDateRange(date, date);
}

export async function getUpcomingSessions(limit = 5): Promise<Session[]> {
  const db = await getLocalDb();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .selectFrom('practice_sessions')
    .selectAll()
    .where('scheduled_date', '>=', today)
    .orderBy('scheduled_date', 'asc')
    .limit(limit)
    .execute();
  return (rows as SessionRow[]).map(rowToSession);
}

export async function createSession(data: {
  title?: string;
  unitId?: number;
  scheduledDate: string;
  scheduledTime?: string;
  durationMinutes?: number;
}): Promise<number> {
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const result = await db
    .insertInto('practice_sessions')
    .values({
      title: data.title ?? null,
      unit_id: data.unitId ?? null,
      scheduled_date: data.scheduledDate,
      scheduled_time: data.scheduledTime ?? null,
      duration_minutes: data.durationMinutes ?? null,
      completed_at: null,
      notes: null,
      created_at: now,
    })
    .executeTakeFirst();
  return Number(result?.insertId ?? 0);
}

export async function updateSession(
  id: number,
  data: Partial<{
    title: string | null;
    unitId: number | null;
    scheduledDate: string;
    scheduledTime: string | null;
    durationMinutes: number | null;
  }>,
): Promise<void> {
  const db = await getLocalDb();
  const mapped: Record<string, unknown> = {};
  if ('title' in data) mapped.title = data.title;
  if ('unitId' in data) mapped.unit_id = data.unitId;
  if (data.scheduledDate !== undefined) mapped.scheduled_date = data.scheduledDate;
  if ('scheduledTime' in data) mapped.scheduled_time = data.scheduledTime;
  if ('durationMinutes' in data) mapped.duration_minutes = data.durationMinutes;
  await db.updateTable('practice_sessions').set(mapped).where('id', '=', id).execute();
}

export async function completeSession(id: number, notes?: string): Promise<void> {
  const db = await getLocalDb();
  await db
    .updateTable('practice_sessions')
    .set({completed_at: new Date().toISOString(), notes: notes ?? null})
    .where('id', '=', id)
    .execute();
}

export async function deleteSession(id: number): Promise<void> {
  const db = await getLocalDb();
  await (db as any).deleteFrom('practice_sessions').where('id', '=', id).execute();
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/lib/local-db/__tests__/programs.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/local-db/programs.ts src/lib/local-db/__tests__/programs.test.ts
git commit -m "feat(db): programs access layer with tests"
```

---

## Task 3: Routes + Nav

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Add route imports to `src/App.tsx`**

Add four lazy imports alongside the existing page imports (follow the existing pattern at the top of App.tsx):

```typescript
import ProgramsPage from '@/pages/programs/ProgramsPage';
import ProgramDetailPage from '@/pages/programs/ProgramDetailPage';
import UnitDetailPage from '@/pages/programs/UnitDetailPage';
import CalendarPage from '@/pages/calendar/CalendarPage';
```

- [ ] **Step 2: Add four routes to the router config in `src/App.tsx`**

In the children array (after the `/learn/lesson/...` route):

```typescript
{path: '/programs', element: <ProgramsPage />},
{path: '/programs/:id', element: <ProgramDetailPage />},
{path: '/programs/:id/units/:unitId', element: <UnitDetailPage />},
{path: '/calendar', element: <CalendarPage />},
```

- [ ] **Step 3: Add nav sections to `src/components/Layout.tsx`**

Find `TOP_NAV_SECTIONS` (around line 22) and add two entries:

```typescript
const TOP_NAV_SECTIONS = [
  {label: 'Practice', prefix: ['/sheet-music', '/guitar', '/rudiments', '/tab-editor', '/fills', '/']},
  {label: 'Library', prefix: ['/library', '/library/setlists']},
  {label: 'Browse', prefix: ['/browse', '/spotify', '/updates']},
  {label: 'Learn', prefix: ['/learn']},
  {label: 'Programs', prefix: ['/programs']},
  {label: 'Calendar', prefix: ['/calendar']},
] as const;
```

- [ ] **Step 4: Wire nav section hrefs**

In `Layout.tsx`, find the section that resolves hrefs (around line 103, the `section.label === 'Learn'` ternary). Extend to cover the two new sections:

```typescript
: section.label === 'Programs' ? '/programs'
: section.label === 'Calendar' ? '/calendar'
```

- [ ] **Step 5: Create stub pages so the app compiles**

Create `src/pages/programs/ProgramsPage.tsx`:
```typescript
export default function ProgramsPage() {
  return <div className="flex-1 p-6"><h1 className="text-xl font-bold font-headline">Programs</h1></div>;
}
```

Create `src/pages/programs/ProgramDetailPage.tsx`:
```typescript
export default function ProgramDetailPage() {
  return <div className="flex-1 p-6"><h1 className="text-xl font-bold font-headline">Program</h1></div>;
}
```

Create `src/pages/programs/UnitDetailPage.tsx`:
```typescript
export default function UnitDetailPage() {
  return <div className="flex-1 p-6"><h1 className="text-xl font-bold font-headline">Unit</h1></div>;
}
```

Create `src/pages/calendar/CalendarPage.tsx`:
```typescript
export default function CalendarPage() {
  return <div className="flex-1 p-6"><h1 className="text-xl font-bold font-headline">Calendar</h1></div>;
}
```

- [ ] **Step 6: Verify app compiles with `npm run build` or `npx tsc --noEmit`**

```bash
cd /Users/alfredoenrione/my-github/mine/chartmate && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/Layout.tsx src/pages/programs/ src/pages/calendar/
git commit -m "feat(nav): add Programs and Calendar routes and nav entries"
```

---

## Task 4: Atom Components — GoalTypeIcon + SessionChip

**Files:**
- Create: `src/components/programs/GoalTypeIcon.tsx`
- Create: `src/components/calendar/SessionChip.tsx`

- [ ] **Step 1: Create `src/components/programs/GoalTypeIcon.tsx`**

```typescript
import {Music, BookOpen, Dumbbell, Guitar, HelpCircle} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Goal} from '@/lib/local-db/programs';

const TYPE_CONFIG: Record<
  Goal['type'],
  {icon: React.ElementType; label: string; className: string}
> = {
  song: {icon: Music, label: 'Song', className: 'text-purple-400'},
  tab: {icon: Guitar, label: 'Tab', className: 'text-blue-400'},
  learn_lesson: {icon: BookOpen, label: 'Lesson', className: 'text-green-400'},
  exercise: {icon: Dumbbell, label: 'Exercise', className: 'text-orange-400'},
  custom: {icon: HelpCircle, label: 'Custom', className: 'text-on-surface-variant'},
};

interface GoalTypeIconProps {
  type: Goal['type'];
  className?: string;
  showLabel?: boolean;
}

export default function GoalTypeIcon({type, className, showLabel = false}: GoalTypeIconProps) {
  const {icon: Icon, label, className: colorClass} = TYPE_CONFIG[type] ?? TYPE_CONFIG.custom;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', colorClass, className)}>
      <Icon className="h-3.5 w-3.5" />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
```

- [ ] **Step 2: Create `src/components/calendar/SessionChip.tsx`**

```typescript
import {CheckCircle2} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {Session} from '@/lib/local-db/programs';

interface SessionChipProps {
  session: Session;
  onClick: () => void;
}

export default function SessionChip({session, onClick}: SessionChipProps) {
  const done = !!session.completedAt;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left text-xs px-1.5 py-0.5 rounded truncate flex items-center gap-1',
        done
          ? 'bg-primary/20 text-primary line-through opacity-60'
          : 'bg-primary/30 text-on-primary-container hover:bg-primary/50',
      )}
    >
      {done && <CheckCircle2 className="h-3 w-3 shrink-0" />}
      <span className="truncate">{session.title ?? 'Practice session'}</span>
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/programs/GoalTypeIcon.tsx src/components/calendar/SessionChip.tsx
git commit -m "feat(ui): GoalTypeIcon and SessionChip atom components"
```

---

## Task 5: SessionModal

**Files:**
- Create: `src/components/programs/SessionModal.tsx`

- [ ] **Step 1: Create `src/components/programs/SessionModal.tsx`**

```typescript
import {useState, useEffect} from 'react';
import {Trash2} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {Session, Unit} from '@/lib/local-db/programs';
import {createSession, updateSession, completeSession, deleteSession} from '@/lib/local-db/programs';

interface SessionModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Pre-fill date when creating from a calendar day click */
  defaultDate?: string;
  /** Pass an existing session to view/edit/complete */
  session?: Session;
  /** Available units for the "link to unit" dropdown */
  units?: Unit[];
}

export default function SessionModal({
  open,
  onClose,
  onSaved,
  defaultDate,
  session,
  units = [],
}: SessionModalProps) {
  const isEditing = !!session;
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  const [unitId, setUnitId] = useState<string>('none');
  const [notes, setNotes] = useState('');
  const [completing, setCompleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(session?.title ?? '');
      setDate(session?.scheduledDate ?? defaultDate ?? '');
      setTime(session?.scheduledTime ?? '');
      setDuration(session?.durationMinutes?.toString() ?? '');
      setUnitId(session?.unitId?.toString() ?? 'none');
      setNotes(session?.notes ?? '');
      setCompleting(false);
      setConfirmDelete(false);
    }
  }, [open, session, defaultDate]);

  async function handleSave() {
    if (!date) return;
    setSaving(true);
    try {
      const data = {
        title: title || undefined,
        unitId: unitId !== 'none' ? Number(unitId) : undefined,
        scheduledDate: date,
        scheduledTime: time || undefined,
        durationMinutes: duration ? Number(duration) : undefined,
      };
      if (isEditing) {
        await updateSession(session.id, {
          title: data.title ?? null,
          unitId: data.unitId ?? null,
          scheduledDate: data.scheduledDate,
          scheduledTime: data.scheduledTime ?? null,
          durationMinutes: data.durationMinutes ?? null,
        });
      } else {
        await createSession(data);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (!session) return;
    setSaving(true);
    try {
      await completeSession(session.id, notes || undefined);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!session) return;
    await deleteSession(session.id);
    onSaved();
    onClose();
  }

  const alreadyDone = !!session?.completedAt;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? (alreadyDone ? 'Session' : 'Edit Session') : 'New Session'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Input
            placeholder="Title (optional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={alreadyDone}
          />

          <div className="flex gap-2">
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={alreadyDone}
              className="flex-1"
            />
            <Input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              disabled={alreadyDone}
              className="w-32"
            />
          </div>

          <Input
            type="number"
            placeholder="Duration (minutes)"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            disabled={alreadyDone}
          />

          {units.length > 0 && (
            <Select value={unitId} onValueChange={setUnitId} disabled={alreadyDone}>
              <SelectTrigger>
                <SelectValue placeholder="Link to unit (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No unit</SelectItem>
                {units.map(u => (
                  <SelectItem key={u.id} value={u.id.toString()}>
                    {u.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(isEditing && !alreadyDone) || completing ? (
            <textarea
              placeholder="Post-session notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container resize-none"
            />
          ) : alreadyDone && session.notes ? (
            <p className="text-sm text-on-surface-variant bg-surface-container rounded-lg p-3">
              {session.notes}
            </p>
          ) : null}
        </div>

        <div className="flex justify-between items-center mt-4">
          <div>
            {isEditing && (
              confirmDelete ? (
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete}>Confirm delete</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            {!alreadyDone && isEditing && (
              <Button variant="outline" onClick={() => setCompleting(true)} disabled={completing}>
                Mark done
              </Button>
            )}
            {completing ? (
              <Button onClick={handleComplete} disabled={saving}>Save & Complete</Button>
            ) : !alreadyDone ? (
              <Button onClick={handleSave} disabled={saving || !date}>
                {isEditing ? 'Save' : 'Create'}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/programs/SessionModal.tsx
git commit -m "feat(ui): SessionModal — create/edit/complete/delete sessions"
```

---

## Task 6: AddGoalForm

**Files:**
- Create: `src/components/programs/AddGoalForm.tsx`

- [ ] **Step 1: Create `src/components/programs/AddGoalForm.tsx`**

```typescript
import {useState} from 'react';
import {Plus, X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {createGoal} from '@/lib/local-db/programs';
import type {Goal} from '@/lib/local-db/programs';

const GOAL_TYPES: {value: Goal['type']; label: string}[] = [
  {value: 'custom', label: 'Custom'},
  {value: 'tab', label: 'Tab composition'},
  {value: 'learn_lesson', label: 'Curriculum lesson'},
  {value: 'exercise', label: 'Built-in exercise'},
];

const EXERCISE_ROUTES: {value: string; label: string}[] = [
  {value: '/guitar/fretboard', label: 'Fretboard IQ'},
  {value: '/guitar/ear', label: 'Ear IQ'},
  {value: '/guitar/repertoire', label: 'Repertoire IQ'},
  {value: '/guitar/chords', label: 'Chord Finder'},
  {value: '/rudiments', label: 'Rudiments'},
  {value: '/fills', label: 'Fills'},
];

interface AddGoalFormProps {
  unitId: number;
  onAdded: () => void;
}

export default function AddGoalForm({unitId, onAdded}: AddGoalFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<Goal['type']>('custom');
  const [refId, setRefId] = useState('');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle('');
    setType('custom');
    setRefId('');
    setTarget('');
    setNotes('');
    setOpen(false);
  }

  async function handleAdd() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createGoal({
        unitId,
        title: title.trim(),
        type,
        refId: refId.trim() || undefined,
        target: target.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onAdded();
      reset();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="w-full border border-dashed border-outline-variant/40">
        <Plus className="h-4 w-4 mr-1" /> Add goal
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-on-surface">New goal</span>
        <button onClick={reset} className="text-on-surface-variant hover:text-on-surface">
          <X className="h-4 w-4" />
        </button>
      </div>

      <Input
        placeholder="Goal title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />

      <Select value={type} onValueChange={v => { setType(v as Goal['type']); setRefId(''); }}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GOAL_TYPES.map(t => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {type === 'tab' && (
        <Input
          placeholder="Tab composition ID"
          value={refId}
          onChange={e => setRefId(e.target.value)}
        />
      )}

      {type === 'learn_lesson' && (
        <Input
          placeholder="e.g. guitar/01-open-chords/02-g-chord"
          value={refId}
          onChange={e => setRefId(e.target.value)}
        />
      )}

      {type === 'exercise' && (
        <Select value={refId} onValueChange={setRefId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose exercise" />
          </SelectTrigger>
          <SelectContent>
            {EXERCISE_ROUTES.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Input
        placeholder="Target (e.g. 120 bpm, first 16 bars)"
        value={target}
        onChange={e => setTarget(e.target.value)}
      />

      <Input
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={reset}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} disabled={saving || !title.trim()}>
          Add goal
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/programs/AddGoalForm.tsx
git commit -m "feat(ui): AddGoalForm component"
```

---

## Task 7: ProgramsPage

**Files:**
- Create: `src/components/programs/ProgramCard.tsx`
- Create: `src/components/programs/NewProgramModal.tsx`
- Modify: `src/pages/programs/ProgramsPage.tsx` (replace stub)

- [ ] **Step 1: Create `src/components/programs/ProgramCard.tsx`**

```typescript
import {Link} from 'react-router-dom';
import {Guitar, Drum, ChevronRight, Play, Archive} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import type {Program} from '@/lib/local-db/programs';
import {activateProgram, archiveProgram} from '@/lib/local-db/programs';

interface ProgramCardProps {
  program: Program;
  unitCount: number;
  completedUnitCount: number;
  onRefresh: () => void;
}

const STATUS_BADGE: Record<Program['status'], {label: string; className: string}> = {
  draft: {label: 'Draft', className: 'bg-surface-container-high text-on-surface-variant'},
  active: {label: 'Active', className: 'bg-primary/20 text-primary'},
  archived: {label: 'Archived', className: 'bg-surface-container text-on-surface-variant opacity-60'},
};

export default function ProgramCard({program, unitCount, completedUnitCount, onRefresh}: ProgramCardProps) {
  const badge = STATUS_BADGE[program.status];
  const progress = unitCount > 0 ? Math.round((completedUnitCount / unitCount) * 100) : 0;

  async function handleActivate(e: React.MouseEvent) {
    e.preventDefault();
    await activateProgram(program.id);
    onRefresh();
  }

  async function handleArchive(e: React.MouseEvent) {
    e.preventDefault();
    await archiveProgram(program.id);
    onRefresh();
  }

  return (
    <Link
      to={`/programs/${program.id}`}
      className={cn(
        'block rounded-2xl border border-outline-variant/20 bg-surface-container p-4 hover:bg-surface-container-high transition-colors',
        program.status === 'active' && 'border-primary/30 bg-primary/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {program.instrument === 'guitar' && <Guitar className="h-4 w-4 text-on-surface-variant shrink-0" />}
            {program.instrument === 'drums' && <Drum className="h-4 w-4 text-on-surface-variant shrink-0" />}
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badge.className)}>
              {badge.label}
            </span>
          </div>
          <h3 className="font-semibold text-on-surface truncate">{program.title}</h3>
          {program.description && (
            <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{program.description}</p>
          )}
          <p className="text-xs text-on-surface-variant mt-2">
            {completedUnitCount}/{unitCount} units complete
          </p>
          {unitCount > 0 && (
            <div className="mt-2 h-1 rounded-full bg-surface-container-high overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{width: `${progress}%`}} />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <ChevronRight className="h-4 w-4 text-on-surface-variant" />
          {program.status === 'draft' && (
            <Button variant="outline" size="sm" onClick={handleActivate}>
              <Play className="h-3 w-3 mr-1" /> Start
            </Button>
          )}
          {program.status === 'active' && (
            <Button variant="ghost" size="sm" onClick={handleArchive}>
              <Archive className="h-3 w-3 mr-1" /> Archive
            </Button>
          )}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create `src/components/programs/NewProgramModal.tsx`**

```typescript
import {useState} from 'react';
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {createProgram} from '@/lib/local-db/programs';

interface NewProgramModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}

export default function NewProgramModal({open, onClose, onCreated}: NewProgramModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instrument, setInstrument] = useState<string>('none');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const id = await createProgram({
        title: title.trim(),
        description: description.trim() || undefined,
        instrument: instrument !== 'none' ? instrument : undefined,
      });
      onCreated(id);
      setTitle('');
      setDescription('');
      setInstrument('none');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Program</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Input placeholder="Program title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl bg-surface-container-high px-3 py-2 text-sm text-on-surface placeholder:text-outline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container resize-none"
          />
          <Select value={instrument} onValueChange={setInstrument}>
            <SelectTrigger>
              <SelectValue placeholder="Instrument (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No specific instrument</SelectItem>
              <SelectItem value="guitar">Guitar</SelectItem>
              <SelectItem value="drums">Drums</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !title.trim()}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Replace stub `src/pages/programs/ProgramsPage.tsx`**

```typescript
import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getPrograms, getUnitsForProgram} from '@/lib/local-db/programs';
import type {Program, Unit} from '@/lib/local-db/programs';
import ProgramCard from '@/components/programs/ProgramCard';
import NewProgramModal from '@/components/programs/NewProgramModal';

interface ProgramWithMeta {
  program: Program;
  units: Unit[];
}

const STATUS_ORDER: Program['status'][] = ['active', 'draft', 'archived'];

export default function ProgramsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ProgramWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    const programs = await getPrograms();
    const withUnits = await Promise.all(
      programs.map(async program => ({
        program,
        units: await getUnitsForProgram(program.id),
      })),
    );
    const sorted = [...withUnits].sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.program.status) - STATUS_ORDER.indexOf(b.program.status),
    );
    setItems(sorted);
    setLoading(false);
  }

  useEffect(() => {load();}, []);

  function handleCreated(id: number) {
    setModalOpen(false);
    navigate(`/programs/${id}`);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-on-surface-variant text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold font-headline">Programs</h1>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New program
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant">
            <p className="text-sm">No programs yet.</p>
            <p className="text-xs mt-1">Create your first practice program to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(({program, units}) => (
              <ProgramCard
                key={program.id}
                program={program}
                unitCount={units.length}
                completedUnitCount={units.filter(u => !!u.completedAt).length}
                onRefresh={load}
              />
            ))}
          </div>
        )}
      </div>

      <NewProgramModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/programs/ProgramCard.tsx src/components/programs/NewProgramModal.tsx src/pages/programs/ProgramsPage.tsx
git commit -m "feat(ui): ProgramsPage with program list, status grouping, new program modal"
```

---

## Task 8: ProgramDetailPage

**Files:**
- Create: `src/components/programs/UnitCard.tsx`
- Modify: `src/pages/programs/ProgramDetailPage.tsx`

- [ ] **Step 1: Create `src/components/programs/UnitCard.tsx`**

```typescript
import {Link} from 'react-router-dom';
import {CheckCircle2, Circle, Clock, ChevronRight, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import type {Unit, Goal} from '@/lib/local-db/programs';
import {completeUnit, deleteUnit} from '@/lib/local-db/programs';

interface UnitCardProps {
  programId: number;
  unit: Unit;
  goals: Goal[];
  orderLabel: string;
  onRefresh: () => void;
}

export default function UnitCard({programId, unit, goals, orderLabel, onRefresh}: UnitCardProps) {
  const done = !!unit.completedAt;
  const completedGoals = goals.filter(g => !!g.completedAt).length;

  async function handleComplete(e: React.MouseEvent) {
    e.preventDefault();
    await completeUnit(unit.id);
    onRefresh();
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    await deleteUnit(unit.id);
    onRefresh();
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-outline-variant/20 bg-surface-container transition-colors',
        done && 'opacity-60',
      )}
    >
      <Link
        to={`/programs/${programId}/units/${unit.id}`}
        className="flex items-center gap-3 p-4 hover:bg-surface-container-high rounded-2xl transition-colors"
      >
        <div className="shrink-0">
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          ) : (
            <Circle className="h-5 w-5 text-on-surface-variant" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant font-mono">{orderLabel}</span>
            {unit.suggestedDays && (
              <span className="flex items-center gap-0.5 text-xs text-on-surface-variant">
                <Clock className="h-3 w-3" /> {unit.suggestedDays}d
              </span>
            )}
          </div>
          <h3 className="font-medium text-on-surface truncate">{unit.title}</h3>
          {unit.description && (
            <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{unit.description}</p>
          )}
          <p className="text-xs text-on-surface-variant mt-1">
            {completedGoals}/{goals.length} goals
          </p>
          {goals.length > 0 && (
            <div className="mt-1.5 h-1 rounded-full bg-surface-container-high overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{width: `${Math.round((completedGoals / goals.length) * 100)}%`}}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <ChevronRight className="h-4 w-4 text-on-surface-variant" />
          {!done && (
            <Button variant="outline" size="sm" onClick={handleComplete}>
              Complete
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 text-error" />
          </Button>
        </div>
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Replace stub `src/pages/programs/ProgramDetailPage.tsx`**

```typescript
import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {ArrowLeft, Plus, Play, Archive} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  getProgram,
  getUnitsForProgram,
  getGoalsForUnit,
  createUnit,
  activateProgram,
  archiveProgram,
} from '@/lib/local-db/programs';
import type {Program, Unit, Goal} from '@/lib/local-db/programs';
import UnitCard from '@/components/programs/UnitCard';

interface UnitWithGoals {
  unit: Unit;
  goals: Goal[];
}

export default function ProgramDetailPage() {
  const {id} = useParams<{id: string}>();
  const navigate = useNavigate();
  const [program, setProgram] = useState<Program | null>(null);
  const [unitsWithGoals, setUnitsWithGoals] = useState<UnitWithGoals[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingUnit, setAddingUnit] = useState(false);
  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [newUnitDays, setNewUnitDays] = useState('');

  async function load() {
    if (!id) return;
    setLoading(true);
    const [prog, units] = await Promise.all([
      getProgram(Number(id)),
      getUnitsForProgram(Number(id)),
    ]);
    if (!prog) {navigate('/programs'); return;}
    const withGoals = await Promise.all(
      units.map(async unit => ({unit, goals: await getGoalsForUnit(unit.id)})),
    );
    setProgram(prog);
    setUnitsWithGoals(withGoals);
    setLoading(false);
  }

  useEffect(() => {load();}, [id]);

  async function handleAddUnit() {
    if (!newUnitTitle.trim() || !id) return;
    await createUnit({
      programId: Number(id),
      title: newUnitTitle.trim(),
      suggestedDays: newUnitDays ? Number(newUnitDays) : undefined,
    });
    setNewUnitTitle('');
    setNewUnitDays('');
    setAddingUnit(false);
    load();
  }

  async function handleActivate() {
    if (!id) return;
    await activateProgram(Number(id));
    load();
  }

  async function handleArchive() {
    if (!id) return;
    await archiveProgram(Number(id));
    load();
  }

  if (loading || !program) {
    return <div className="flex-1 flex items-center justify-center"><span className="text-on-surface-variant text-sm">Loading...</span></div>;
  }

  const totalUnits = unitsWithGoals.length;
  const completedUnits = unitsWithGoals.filter(({unit}) => !!unit.completedAt).length;
  const progress = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/programs')} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface mb-4">
          <ArrowLeft className="h-4 w-4" /> Programs
        </button>

        <div className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold font-headline">{program.title}</h1>
              {program.description && <p className="text-sm text-on-surface-variant mt-1">{program.description}</p>}
              <p className="text-xs text-on-surface-variant mt-2">{completedUnits}/{totalUnits} units complete</p>
              {totalUnits > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{width: `${progress}%`}} />
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {program.status === 'draft' && (
                <Button variant="outline" size="sm" onClick={handleActivate}>
                  <Play className="h-3 w-3 mr-1" /> Start
                </Button>
              )}
              {program.status === 'active' && (
                <Button variant="ghost" size="sm" onClick={handleArchive}>
                  <Archive className="h-3 w-3 mr-1" /> Archive
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {unitsWithGoals.map(({unit, goals}, i) => (
            <UnitCard
              key={unit.id}
              programId={program.id}
              unit={unit}
              goals={goals}
              orderLabel={`${i + 1}.`}
              onRefresh={load}
            />
          ))}

          {addingUnit ? (
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4 space-y-3">
              <Input
                placeholder="Unit title"
                value={newUnitTitle}
                onChange={e => setNewUnitTitle(e.target.value)}
                autoFocus
              />
              <Input
                type="number"
                placeholder="Suggested days (optional)"
                value={newUnitDays}
                onChange={e => setNewUnitDays(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setAddingUnit(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddUnit} disabled={!newUnitTitle.trim()}>Add unit</Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="w-full border border-dashed border-outline-variant/40"
              onClick={() => setAddingUnit(true)}
            >
              <Plus className="h-4 w-4 mr-1" /> Add unit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/programs/UnitCard.tsx src/pages/programs/ProgramDetailPage.tsx
git commit -m "feat(ui): ProgramDetailPage with unit list and add-unit form"
```

---

## Task 9: UnitDetailPage

**Files:**
- Create: `src/components/programs/GoalItem.tsx`
- Modify: `src/pages/programs/UnitDetailPage.tsx`

- [ ] **Step 1: Create `src/components/programs/GoalItem.tsx`**

```typescript
import {useNavigate} from 'react-router-dom';
import {ExternalLink, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';
import type {Goal} from '@/lib/local-db/programs';
import {completeGoal, uncompleteGoal, deleteGoal} from '@/lib/local-db/programs';
import GoalTypeIcon from './GoalTypeIcon';

interface GoalItemProps {
  goal: Goal;
  onRefresh: () => void;
}

function resolveLink(goal: Goal): string | null {
  if (goal.type === 'tab' && goal.refId) return `/tab-editor/${goal.refId}`;
  if (goal.type === 'learn_lesson' && goal.refId) {
    const [instrument, unitId, lessonId] = goal.refId.split('/');
    if (instrument && unitId && lessonId)
      return `/learn/lesson/${instrument}/${unitId}/${lessonId}`;
  }
  if (goal.type === 'exercise' && goal.refId) return goal.refId;
  return null;
}

export default function GoalItem({goal, onRefresh}: GoalItemProps) {
  const navigate = useNavigate();
  const done = !!goal.completedAt;
  const link = resolveLink(goal);

  async function handleToggle() {
    if (done) {
      await uncompleteGoal(goal.id);
    } else {
      await completeGoal(goal.id);
    }
    onRefresh();
  }

  async function handleDelete() {
    await deleteGoal(goal.id);
    onRefresh();
  }

  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl p-3 bg-surface-container border border-outline-variant/20',
      done && 'opacity-60',
    )}>
      <button
        onClick={handleToggle}
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0 rounded border-2 transition-colors flex items-center justify-center',
          done
            ? 'bg-primary border-primary text-on-primary'
            : 'border-outline-variant hover:border-primary',
        )}
      >
        {done && (
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <GoalTypeIcon type={goal.type} showLabel />
        </div>
        <p className={cn('text-sm font-medium text-on-surface', done && 'line-through')}>{goal.title}</p>
        {goal.target && (
          <p className="text-xs text-primary mt-0.5">Target: {goal.target}</p>
        )}
        {goal.notes && (
          <p className="text-xs text-on-surface-variant mt-0.5">{goal.notes}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {link && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(link)}>
            <ExternalLink className="h-3.5 w-3.5 text-primary" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5 text-error" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace stub `src/pages/programs/UnitDetailPage.tsx`**

```typescript
import {useEffect, useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {ArrowLeft, CheckCircle2, Calendar} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  getUnit,
  getGoalsForUnit,
  completeUnit,
  getProgram,
  getSessionsForDate,
  createSession,
} from '@/lib/local-db/programs';
import type {Unit, Goal, Session, Program} from '@/lib/local-db/programs';
import GoalItem from '@/components/programs/GoalItem';
import AddGoalForm from '@/components/programs/AddGoalForm';
import SessionModal from '@/components/programs/SessionModal';

export default function UnitDetailPage() {
  const {id, unitId} = useParams<{id: string; unitId: string}>();
  const navigate = useNavigate();
  const [program, setProgram] = useState<Program | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [editSession, setEditSession] = useState<Session | undefined>();

  async function load() {
    if (!id || !unitId) return;
    const [prog, u, g] = await Promise.all([
      getProgram(Number(id)),
      getUnit(Number(unitId)),
      getGoalsForUnit(Number(unitId)),
    ]);
    if (!u) {navigate(`/programs/${id}`); return;}
    const today = new Date().toISOString().slice(0, 10);
    const sessions = await getSessionsForDate(today);
    const unitSessions = sessions.filter(s => s.unitId === Number(unitId));
    setProgram(prog);
    setUnit(u);
    setGoals(g);
    setTodaySessions(unitSessions);
  }

  useEffect(() => {load();}, [id, unitId]);

  async function handleMarkComplete() {
    if (!unitId) return;
    await completeUnit(Number(unitId));
    load();
  }

  async function handleScheduleToday() {
    if (!unitId) return;
    await createSession({
      scheduledDate: new Date().toISOString().slice(0, 10),
      unitId: Number(unitId),
    });
    load();
  }

  if (!unit) {
    return <div className="flex-1 flex items-center justify-center"><span className="text-on-surface-variant text-sm">Loading...</span></div>;
  }

  const completedGoals = goals.filter(g => !!g.completedAt).length;
  const done = !!unit.completedAt;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(`/programs/${id}`)}
          className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> {program?.title ?? 'Program'}
        </button>

        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold font-headline">{unit.title}</h1>
            {unit.description && <p className="text-sm text-on-surface-variant mt-1">{unit.description}</p>}
            <p className="text-xs text-on-surface-variant mt-2">
              {completedGoals}/{goals.length} goals · {unit.suggestedDays ? `~${unit.suggestedDays} days` : 'flexible pace'}
            </p>
            {goals.length > 0 && (
              <div className="mt-2 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{width: `${Math.round((completedGoals / goals.length) * 100)}%`}}
                />
              </div>
            )}
          </div>
          {!done && (
            <Button variant="outline" size="sm" onClick={handleMarkComplete}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark complete
            </Button>
          )}
        </div>

        {/* Sessions section */}
        <div className="mb-6 rounded-xl border border-outline-variant/20 bg-surface-container p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-on-surface">Today's sessions</span>
            <Button variant="ghost" size="sm" onClick={() => {setEditSession(undefined); setSessionModalOpen(true);}}>
              <Calendar className="h-3.5 w-3.5 mr-1" /> Schedule
            </Button>
          </div>
          {todaySessions.length === 0 ? (
            <p className="text-xs text-on-surface-variant">No sessions today for this unit.</p>
          ) : (
            <div className="space-y-2">
              {todaySessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => {setEditSession(s); setSessionModalOpen(true);}}
                  className="cursor-pointer text-sm text-on-surface px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest"
                >
                  {s.title ?? 'Practice session'}{s.scheduledTime ? ` · ${s.scheduledTime}` : ''}{s.completedAt ? ' ✓' : ''}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Goals */}
        <div className="space-y-2">
          {goals.map(goal => (
            <GoalItem key={goal.id} goal={goal} onRefresh={load} />
          ))}
          <AddGoalForm unitId={unit.id} onAdded={load} />
        </div>
      </div>

      <SessionModal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        onSaved={load}
        defaultDate={new Date().toISOString().slice(0, 10)}
        session={editSession}
        units={unit ? [unit] : []}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/programs/GoalItem.tsx src/pages/programs/UnitDetailPage.tsx
git commit -m "feat(ui): UnitDetailPage with goals, AddGoalForm, session scheduling"
```

---

## Task 10: CalendarPage

**Files:**
- Create: `src/components/calendar/CalendarGrid.tsx`
- Modify: `src/pages/calendar/CalendarPage.tsx`

- [ ] **Step 1: Create `src/components/calendar/CalendarGrid.tsx`**

```typescript
import {cn} from '@/lib/utils';
import type {Session} from '@/lib/local-db/programs';
import SessionChip from './SessionChip';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarGridProps {
  year: number;
  month: number; // 0-indexed
  sessions: Session[];
  onDayClick: (date: string) => void;
  onSessionClick: (session: Session) => void;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarGrid({
  year,
  month,
  sessions,
  onDayClick,
  onSessionClick,
}: CalendarGridProps) {
  const today = new Date().toISOString().slice(0, 10);
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Group sessions by date
  const byDate = new Map<string, Session[]>();
  for (const s of sessions) {
    const existing = byDate.get(s.scheduledDate) ?? [];
    byDate.set(s.scheduledDate, [...existing, s]);
  }

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({length: daysInMonth}, (_, i) => i + 1),
  ];
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="select-none">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-on-surface-variant py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-outline-variant/10 rounded-xl overflow-hidden">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={idx} className="bg-surface-container min-h-[80px]" />;
          }
          const dateStr = toDateStr(year, month, day);
          const daySessions = byDate.get(dateStr) ?? [];
          const isToday = dateStr === today;

          return (
            <div
              key={idx}
              onClick={() => onDayClick(dateStr)}
              className={cn(
                'bg-surface-container min-h-[80px] p-1 cursor-pointer hover:bg-surface-container-high transition-colors',
                isToday && 'bg-primary/5',
              )}
            >
              <div className={cn(
                'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                isToday ? 'bg-primary text-on-primary' : 'text-on-surface-variant',
              )}>
                {day}
              </div>
              <div className="space-y-0.5">
                {daySessions.slice(0, 3).map(s => (
                  <SessionChip
                    key={s.id}
                    session={s}
                    onClick={e => {
                      (e as unknown as React.MouseEvent).stopPropagation();
                      onSessionClick(s);
                    }}
                  />
                ))}
                {daySessions.length > 3 && (
                  <div className="text-xs text-on-surface-variant px-1">+{daySessions.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace stub `src/pages/calendar/CalendarPage.tsx`**

```typescript
import {useEffect, useState} from 'react';
import {ChevronLeft, ChevronRight, CalendarDays} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getSessionsForDateRange, getUpcomingSessions} from '@/lib/local-db/programs';
import type {Session} from '@/lib/local-db/programs';
import CalendarGrid from '@/components/calendar/CalendarGrid';
import SessionModal from '@/components/programs/SessionModal';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [upcoming, setUpcoming] = useState<Session[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [clickedDate, setClickedDate] = useState<string | undefined>();
  const [editSession, setEditSession] = useState<Session | undefined>();

  async function load() {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const [monthSessions, upcomingSessions] = await Promise.all([
      getSessionsForDateRange(from, to),
      getUpcomingSessions(7),
    ]);
    setSessions(monthSessions);
    setUpcoming(upcomingSessions);
  }

  useEffect(() => {load();}, [year, month]);

  function prevMonth() {
    if (month === 0) {setYear(y => y - 1); setMonth(11);}
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) {setYear(y => y + 1); setMonth(0);}
    else setMonth(m => m + 1);
  }

  function handleDayClick(date: string) {
    setClickedDate(date);
    setEditSession(undefined);
    setModalOpen(true);
  }

  function handleSessionClick(session: Session) {
    setEditSession(session);
    setClickedDate(undefined);
    setModalOpen(true);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
      {/* Main calendar */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold font-headline flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              {MONTH_NAMES[month]} {year}
            </h1>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {setYear(now.getFullYear()); setMonth(now.getMonth());}}
              >
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <CalendarGrid
            year={year}
            month={month}
            sessions={sessions}
            onDayClick={handleDayClick}
            onSessionClick={handleSessionClick}
          />
        </div>
      </div>

      {/* Sidebar — upcoming sessions */}
      <div className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-outline-variant/20 p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-on-surface mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-xs text-on-surface-variant">No upcoming sessions.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map(s => (
              <div
                key={s.id}
                onClick={() => handleSessionClick(s)}
                className="cursor-pointer rounded-lg bg-surface-container p-3 hover:bg-surface-container-high transition-colors"
              >
                <p className="text-sm font-medium text-on-surface">{s.title ?? 'Practice session'}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {s.scheduledDate}{s.scheduledTime ? ` · ${s.scheduledTime}` : ''}
                  {s.completedAt ? ' · Done' : ''}
                </p>
              </div>
            ))}
          </div>
        )}
        <Button
          className="w-full mt-4"
          size="sm"
          onClick={() => {setClickedDate(new Date().toISOString().slice(0, 10)); setEditSession(undefined); setModalOpen(true);}}
        >
          New session
        </Button>
      </div>

      <SessionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        defaultDate={clickedDate}
        session={editSession}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/CalendarGrid.tsx src/pages/calendar/CalendarPage.tsx
git commit -m "feat(ui): CalendarPage with month grid, session chips, upcoming sidebar"
```

---

## Task 11: UpcomingSessionsWidget + LearnPage Integration

**Files:**
- Create: `src/components/programs/UpcomingSessionsWidget.tsx`
- Modify: `src/pages/learn/LearnPage.tsx`

- [ ] **Step 1: Create `src/components/programs/UpcomingSessionsWidget.tsx`**

```typescript
import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {CalendarDays, ChevronRight, BookOpen} from 'lucide-react';
import {cn} from '@/lib/utils';
import {getUpcomingSessions, getActiveProgram, getUnitsForProgram} from '@/lib/local-db/programs';
import type {Session, Program, Unit} from '@/lib/local-db/programs';

interface WidgetData {
  todaySessions: Session[];
  upcomingSessions: Session[];
  activeProgram: Program | null;
  currentUnit: Unit | null;
  completedGoalCount: number;
  totalGoalCount: number;
}

export default function UpcomingSessionsWidget() {
  const [data, setData] = useState<WidgetData | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const [upcoming, activeProgram] = await Promise.all([
        getUpcomingSessions(7),
        getActiveProgram(),
      ]);
      const todaySessions = upcoming.filter(s => s.scheduledDate === today);
      const upcomingSessions = upcoming.filter(s => s.scheduledDate > today).slice(0, 4);

      let currentUnit: Unit | null = null;
      let completedGoalCount = 0;
      let totalGoalCount = 0;

      if (activeProgram) {
        const units = await getUnitsForProgram(activeProgram.id);
        const inProgress = units.find(u => u.startedAt && !u.completedAt);
        const nextUp = units.find(u => !u.completedAt);
        currentUnit = inProgress ?? nextUp ?? null;
      }

      setData({todaySessions, upcomingSessions, activeProgram, currentUnit, completedGoalCount, totalGoalCount});
    }
    load();
  }, []);

  if (!data) return null;
  const {todaySessions, upcomingSessions, activeProgram, currentUnit} = data;
  if (!activeProgram && todaySessions.length === 0 && upcomingSessions.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-outline-variant/20">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-6 py-3 hover:bg-surface-container-high transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-on-surface">
          <CalendarDays className="h-4 w-4 text-primary" />
          Practice schedule
        </span>
        <ChevronRight className={cn('h-4 w-4 text-on-surface-variant transition-transform', !collapsed && 'rotate-90')} />
      </button>

      {!collapsed && (
        <div className="px-6 pb-4 space-y-3">
          {/* Active program + unit */}
          {activeProgram && currentUnit && (
            <Link
              to={`/programs/${activeProgram.id}/units/${currentUnit.id}`}
              className="flex items-center gap-3 rounded-xl bg-surface-container p-3 hover:bg-surface-container-high transition-colors"
            >
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-on-surface-variant">{activeProgram.title}</p>
                <p className="text-sm font-medium text-on-surface truncate">{currentUnit.title}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-on-surface-variant shrink-0" />
            </Link>
          )}

          {/* Today's sessions */}
          {todaySessions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-on-surface-variant mb-1.5">Today</p>
              <div className="space-y-1">
                {todaySessions.map(s => (
                  <Link
                    key={s.id}
                    to="/calendar"
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                      s.completedAt
                        ? 'text-on-surface-variant line-through bg-surface-container/50'
                        : 'bg-primary/10 text-on-surface hover:bg-primary/20',
                    )}
                  >
                    <span className="flex-1 truncate">{s.title ?? 'Practice session'}</span>
                    {s.scheduledTime && <span className="text-xs text-on-surface-variant shrink-0">{s.scheduledTime}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming sessions */}
          {upcomingSessions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-on-surface-variant mb-1.5">Upcoming</p>
              <div className="space-y-1">
                {upcomingSessions.map(s => (
                  <Link
                    key={s.id}
                    to="/calendar"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                  >
                    <span className="flex-1 truncate">{s.title ?? 'Practice session'}</span>
                    <span className="text-xs shrink-0">{s.scheduledDate}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <Link to="/calendar" className="text-xs text-primary hover:underline block text-right">
            View calendar →
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add widget to `src/pages/learn/LearnPage.tsx`**

Import the widget at the top of `LearnPage.tsx`:
```typescript
import UpcomingSessionsWidget from '@/components/programs/UpcomingSessionsWidget';
```

In the JSX, add the widget immediately after the opening `<div className="flex-1 min-h-0 flex flex-col overflow-hidden">`:
```tsx
<UpcomingSessionsWidget />
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass (including the new programs.test.ts)

- [ ] **Step 4: Commit**

```bash
git add src/components/programs/UpcomingSessionsWidget.tsx src/pages/learn/LearnPage.tsx
git commit -m "feat(ui): UpcomingSessionsWidget on Learn hub showing today/upcoming sessions and active unit"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Programs CRUD (Task 1–7)
- ✅ Units with suggested duration (Task 1–8)
- ✅ Goals with types, refId, target, notes (Task 1, 6, 9)
- ✅ Sessions scheduled to calendar (Task 1–2, 5, 10)
- ✅ Calendar page with month grid (Task 10)
- ✅ In-app reminder widget on /learn (Task 11)
- ✅ Nav entries (Task 3)
- ✅ Integration: learn_lesson link, tab link, exercise link (Task 9 — GoalItem.resolveLink)
- ✅ One active program at a time (Task 2 — activateProgram)
- ✅ Song goal type deferred (not in AddGoalForm — custom type can cover it)

**Type consistency:**
- `Program`, `Unit`, `Goal`, `Session` defined once in `programs.ts`, imported everywhere
- `Goal['type']` union used in `GoalTypeIcon`, `AddGoalForm`, `GoalItem` consistently
- `Session.scheduledDate` (camelCase) used in all components; DB layer maps `scheduled_date`

**Known deferred (per spec):**
- Drag-to-reorder units/goals (order_index in DB, UI buttons not added)
- Song goal ref picker
- CLI interface
