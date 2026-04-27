import {describe, it, expect, vi, beforeEach} from 'vitest';

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

beforeEach(() => vi.clearAllMocks());

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
  it('calls updateTable twice — deactivate others then activate target', async () => {
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
  it('inserts into lesson_sessions and returns id', async () => {
    const db = makeDbMock({insertId: 9});
    mockGet.mockResolvedValue(db as any);
    const id = await createSession({scheduledDate: '2026-04-27'});
    expect(id).toBe(9);
    expect(db.insertInto).toHaveBeenCalledWith('lesson_sessions');
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
