/**
 * Tests for src/lib/local-db/learn.ts
 *
 * Strategy: mock getLocalDb() to return a controlled in-memory Kysely-like
 * object so we can verify the correct SQL operations are invoked without a
 * real SQLite/Tauri runtime.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';

// ── helpers for the fluent Kysely query builder mock ────────────────────────

/** Creates a chainable mock that records the terminal call (.execute / .executeTakeFirst). */
function makeQueryBuilder(resolvedValue: unknown = undefined) {
  const self: Record<string, (...args: unknown[]) => unknown> = {};
  const chain = () => self;

  self.values = vi.fn(chain);
  self.set = vi.fn(chain);
  self.where = vi.fn(chain);
  self.select = vi.fn(chain);
  self.selectAll = vi.fn(chain);
  self.limit = vi.fn(chain);

  // onConflict: Kysely passes a builder to the callback.
  // The callback returns a result (the inner onConflict builder),
  // but the outer chain's .execute() is still on `self`.
  self.onConflict = vi.fn((cb?: (oc: unknown) => unknown) => {
    if (cb) {
      // The inner builder passed to the callback
      const ocBuilder: Record<string, (...args: unknown[]) => unknown> = {};
      ocBuilder.columns = vi.fn(() => {
        const colBuilder: Record<string, (...args: unknown[]) => unknown> = {};
        colBuilder.doNothing = vi.fn(() => ocBuilder);
        colBuilder.doUpdateSet = vi.fn(() => colBuilder);
        return colBuilder;
      });
      cb(ocBuilder);
    }
    // onConflict returns self so .execute() remains accessible
    return self;
  });

  self.execute = vi.fn(() => Promise.resolve(resolvedValue ?? []));
  self.executeTakeFirst = vi.fn(() => Promise.resolve(resolvedValue));
  return self;
}

/** Builds a minimal mock Kysely<DB> instance */
function makeDbMock(overrides: {
  insertBuilder?: Record<string, unknown>;
  selectBuilder?: Record<string, unknown>;
  updateBuilder?: Record<string, unknown>;
  transactionResult?: unknown;
} = {}) {
  const insertBuilder = overrides.insertBuilder ?? makeQueryBuilder();
  const selectBuilder = overrides.selectBuilder ?? makeQueryBuilder(null);
  const updateBuilder = overrides.updateBuilder ?? makeQueryBuilder();

  const db = {
    insertInto: vi.fn(() => insertBuilder),
    selectFrom: vi.fn(() => selectBuilder),
    updateTable: vi.fn(() => updateBuilder),
    transaction: vi.fn(() => ({
      execute: vi.fn((fn: (trx: unknown) => Promise<unknown>) =>
        fn({
          insertInto: vi.fn(() => makeQueryBuilder()),
          selectFrom: vi.fn(() => makeQueryBuilder(null)),
          updateTable: vi.fn(() => makeQueryBuilder()),
        }),
      ),
    })),
  };
  return db;
}

// ── Mock getLocalDb ──────────────────────────────────────────────────────────

vi.mock('../client', () => ({
  getLocalDb: vi.fn(),
}));

import {getLocalDb} from '../client';
import {markLessonCompleted, recordXp} from '../learn';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('markLessonCompleted', () => {
  let db: ReturnType<typeof makeDbMock>;
  let insertBuilder: ReturnType<typeof makeQueryBuilder>;

  beforeEach(() => {
    insertBuilder = makeQueryBuilder() as ReturnType<typeof makeQueryBuilder>;
    db = makeDbMock({insertBuilder: insertBuilder as Record<string, unknown>});
    vi.mocked(getLocalDb).mockResolvedValue(db as never);
  });

  it('inserts into learn_progress with correct columns', async () => {
    await markLessonCompleted('guitar', 'unit-1', 'lesson-1');
    expect(db.insertInto).toHaveBeenCalledWith('learn_progress');
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        instrument: 'guitar',
        unit_id: 'unit-1',
        lesson_id: 'lesson-1',
      }),
    );
  });

  it('uses onConflict for idempotency (onConflict is called)', async () => {
    await markLessonCompleted('guitar', 'unit-1', 'lesson-1');
    expect(insertBuilder.onConflict).toHaveBeenCalled();
  });

  it('onConflict callback targets the correct conflict columns', async () => {
    // Capture what the oc builder receives
    const capturedOc: Array<{columns: string[]; doNothing: boolean}> = [];
    insertBuilder.onConflict = vi.fn((cb?: (oc: unknown) => unknown) => {
      if (cb) {
        const ocBuilder = {
          columns: vi.fn((cols: string[]) => {
            const colBuilder = {
              doNothing: vi.fn(() => {
                capturedOc.push({columns: cols, doNothing: true});
                return colBuilder;
              }),
              doUpdateSet: vi.fn(() => colBuilder),
            };
            return colBuilder;
          }),
        };
        cb(ocBuilder);
      }
      return insertBuilder;
    });

    await markLessonCompleted('guitar', 'unit-1', 'lesson-1');
    expect(capturedOc).toHaveLength(1);
    expect(capturedOc[0].columns).toEqual(['instrument', 'unit_id', 'lesson_id']);
    expect(capturedOc[0].doNothing).toBe(true);
  });

  it('calling twice does not throw (idempotent intent)', async () => {
    await expect(markLessonCompleted('guitar', 'unit-1', 'lesson-1')).resolves.not.toThrow();
    await expect(markLessonCompleted('guitar', 'unit-1', 'lesson-1')).resolves.not.toThrow();
  });
});

describe('recordXp', () => {
  let db: ReturnType<typeof makeDbMock>;
  let selectBuilder: ReturnType<typeof makeQueryBuilder>;
  let insertBuilder: ReturnType<typeof makeQueryBuilder>;

  beforeEach(() => {
    selectBuilder = makeQueryBuilder(null) as ReturnType<typeof makeQueryBuilder>; // no existing record
    insertBuilder = makeQueryBuilder() as ReturnType<typeof makeQueryBuilder>;
    db = makeDbMock({
      selectBuilder: selectBuilder as Record<string, unknown>,
      insertBuilder: insertBuilder as Record<string, unknown>,
    });
    vi.mocked(getLocalDb).mockResolvedValue(db as never);
  });

  it('inserts into learn_xp_ledger with correct fields', async () => {
    await recordXp(10, 'lesson', 'guitar', 'lesson-1');
    expect(db.insertInto).toHaveBeenCalledWith('learn_xp_ledger');
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10,
        source: 'lesson',
        instrument: 'guitar',
        lesson_id: 'lesson-1',
      }),
    );
  });

  it('does not insert when duplicate entry exists today', async () => {
    // Return an existing record from the select check
    const existingRecord = {id: 42};
    const selectWithExisting = makeQueryBuilder(existingRecord) as ReturnType<typeof makeQueryBuilder>;
    db.selectFrom = vi.fn(() => selectWithExisting);
    vi.mocked(getLocalDb).mockResolvedValue(db as never);

    await recordXp(10, 'lesson', 'guitar', 'lesson-1');
    // insertInto should NOT have been called since duplicate exists
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('inserts with correct source field for heart_bonus', async () => {
    await recordXp(5, 'heart_bonus', 'guitar', 'lesson-2');
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({source: 'heart_bonus'}),
    );
  });

  it('includes earned_at timestamp in insert', async () => {
    await recordXp(10, 'lesson', 'guitar', 'lesson-1');
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({earned_at: expect.any(String)}),
    );
  });
});
