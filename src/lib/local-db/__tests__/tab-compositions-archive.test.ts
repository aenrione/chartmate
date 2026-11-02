import {describe, it, expect, vi, beforeEach} from 'vitest';

// Same recording Kysely stand-in as tab-compositions-tags.test.ts: every
// query-builder call is logged so tests can assert what was queried.
type Call = {method: string; args: unknown[]};
type Op = {kind: 'select' | 'insert' | 'update' | 'delete'; table: string; calls: Call[]};

function makeDb(opts: {
  rowsByTable?: Record<string, unknown[]>;
  firstByTable?: Record<string, unknown>;
} = {}) {
  const ops: Op[] = [];
  const builder = (op: Op) => {
    const self: Record<string, unknown> = {};
    for (const method of ['values', 'set', 'where', 'select', 'selectAll', 'orderBy', 'groupBy', 'limit']) {
      self[method] = vi.fn((...args: unknown[]) => { op.calls.push({method, args}); return self; });
    }
    self.execute = vi.fn(async () => (op.kind === 'select' ? opts.rowsByTable?.[op.table] ?? [] : []));
    self.executeTakeFirst = vi.fn(async () => opts.firstByTable?.[op.table] ?? null);
    self.executeTakeFirstOrThrow = vi.fn(async () => ({insertId: BigInt(1)}));
    return self;
  };
  const start = (kind: Op['kind']) => (table: string) => {
    const op: Op = {kind, table, calls: []};
    ops.push(op);
    return builder(op);
  };
  return {
    ops,
    db: {
      selectFrom: vi.fn(start('select')),
      insertInto: vi.fn(start('insert')),
      updateTable: vi.fn(start('update')),
      deleteFrom: vi.fn(start('delete')),
    },
  };
}

const argsOf = (op: Op, method: string) => op.calls.filter(c => c.method === method).map(c => c.args);
const whereOn = (ops: Op[], table: string, column: string) =>
  ops.filter(o => o.table === table).flatMap(o => argsOf(o, 'where')).filter(a => a[0] === column);

vi.mock('../client', () => ({getLocalDb: vi.fn()}));

import {getLocalDb} from '../client';
import {
  countArchivedCompositions,
  getRecentCompositions,
  getSavedCompositions,
  isArchived,
  listCompositions,
  rowToComposition,
  setCompositionArchived,
  setCompositionsArchived,
} from '../tab-compositions';

const mockGet = vi.mocked(getLocalDb);

function useDb(opts: Parameters<typeof makeDb>[0] = {}) {
  const mock = makeDb(opts);
  mockGet.mockResolvedValue(mock.db as any);
  return mock;
}

const ISO = /^\d{4}-\d{2}-\d{2}/;

beforeEach(() => vi.clearAllMocks());

describe('archived_at mapping', () => {
  const ROW = {
    id: 7, title: 'T', artist: 'A', album: '', tempo: 120, instrument: 'guitar',
    preview_image: null, youtube_url: null, is_saved: 1, saved_at: null,
    created_at: 'x', updated_at: 'x',
  };

  it('maps archived_at to archivedAt', () => {
    expect(rowToComposition({...ROW, archived_at: '2026-10-26T00:00:00.000Z'}).archivedAt)
      .toBe('2026-10-26T00:00:00.000Z');
  });

  it('treats a missing or null archived_at as active', () => {
    expect(rowToComposition(ROW).archivedAt).toBeNull();
    expect(rowToComposition({...ROW, archived_at: null}).archivedAt).toBeNull();
  });

  it('isArchived follows archivedAt', () => {
    expect(isArchived({archivedAt: null})).toBe(false);
    expect(isArchived({archivedAt: '2026-10-26T00:00:00.000Z'})).toBe(true);
  });
});

describe('setCompositionArchived', () => {
  it('stamps archived_at on the one row and returns it', async () => {
    const {ops} = useDb();
    const at = await setCompositionArchived(7, true);

    expect(at).toMatch(ISO);
    expect(ops.map(o => `${o.kind}:${o.table}`)).toEqual(['update:tab_compositions']);
    expect(argsOf(ops[0], 'set')).toEqual([[{archived_at: at}]]);
    expect(argsOf(ops[0], 'where')).toEqual([['id', '=', 7]]);
  });

  it('clears archived_at when unarchiving', async () => {
    const {ops} = useDb();
    expect(await setCompositionArchived(7, false)).toBeNull();
    expect(argsOf(ops[0], 'set')).toEqual([[{archived_at: null}]]);
  });

  it('never deletes anything (tags and the score are untouched)', async () => {
    const {db} = useDb();
    await setCompositionArchived(7, true);
    expect(db.deleteFrom).not.toHaveBeenCalled();
    expect(db.insertInto).not.toHaveBeenCalled();
  });
});

describe('setCompositionsArchived', () => {
  it('archives every id with one timestamp and returns the count', async () => {
    const {ops} = useDb();
    const n = await setCompositionsArchived([1, 2, 2, 3], true);

    expect(n).toBe(3);
    expect(ops).toHaveLength(1);
    expect(argsOf(ops[0], 'where')).toEqual([['id', 'in', [1, 2, 3]]]);
    expect((argsOf(ops[0], 'set')[0][0] as any).archived_at).toMatch(ISO);
  });

  it('unarchives in bulk', async () => {
    const {ops} = useDb();
    await setCompositionsArchived([4, 5], false);
    expect(argsOf(ops[0], 'set')).toEqual([[{archived_at: null}]]);
  });

  it('chunks large selections to stay under the SQLite parameter limit', async () => {
    const {ops} = useDb();
    const n = await setCompositionsArchived(Array.from({length: 1200}, (_, i) => i + 1), true);

    expect(n).toBe(1200);
    const chunks = ops.map(o => argsOf(o, 'where')[0][2] as number[]);
    expect(chunks.map(c => c.length)).toEqual([500, 500, 200]);
  });

  it('does nothing for no ids', async () => {
    const {db} = useDb();
    expect(await setCompositionsArchived([], true)).toBe(0);
    expect(db.updateTable).not.toHaveBeenCalled();
  });
});

describe('listing scopes', () => {
  it('getSavedCompositions hides archived rows by default', async () => {
    const {ops} = useDb();
    await getSavedCompositions('guitar');
    expect(whereOn(ops, 'tab_compositions', 'archived_at')).toEqual([['archived_at', 'is', null]]);
  });

  it('getSavedCompositions can ask for archived rows only', async () => {
    const {ops} = useDb();
    await getSavedCompositions('guitar', undefined, 'saved_at_desc', 'archived');
    expect(whereOn(ops, 'tab_compositions', 'archived_at')).toEqual([['archived_at', 'is not', null]]);
  });

  it('getSavedCompositions with scope "all" does not filter on archived_at', async () => {
    const {ops} = useDb();
    await getSavedCompositions('guitar', undefined, 'saved_at_desc', 'all');
    expect(whereOn(ops, 'tab_compositions', 'archived_at')).toEqual([]);
  });

  it('getRecentCompositions hides archived rows', async () => {
    const {ops} = useDb();
    await getRecentCompositions('guitar');
    expect(whereOn(ops, 'tab_compositions', 'archived_at')).toEqual([['archived_at', 'is', null]]);
  });

  it('listCompositions lists everything by default, so references keep resolving', async () => {
    const {ops} = useDb();
    await listCompositions();
    expect(whereOn(ops, 'tab_compositions', 'archived_at')).toEqual([]);
  });

  it('listCompositions can be scoped to active rows', async () => {
    const {ops} = useDb();
    await listCompositions('active');
    expect(whereOn(ops, 'tab_compositions', 'archived_at')).toEqual([['archived_at', 'is', null]]);
  });
});

describe('countArchivedCompositions', () => {
  it('counts saved archived rows of one instrument', async () => {
    const {ops} = useDb({firstByTable: {tab_compositions: {count: '12'}}});
    expect(await countArchivedCompositions('guitar')).toBe(12);
    expect(argsOf(ops[0], 'where')).toEqual([
      ['is_saved', '=', 1], ['archived_at', 'is not', null], ['instrument', '=', 'guitar'],
    ]);
  });

  it('counts every instrument when none is given', async () => {
    const {ops} = useDb({firstByTable: {tab_compositions: {count: 3}}});
    expect(await countArchivedCompositions()).toBe(3);
    expect(argsOf(ops[0], 'where')).toEqual([['is_saved', '=', 1], ['archived_at', 'is not', null]]);
  });

  it('returns 0 when the query finds nothing', async () => {
    useDb();
    expect(await countArchivedCompositions()).toBe(0);
  });
});
