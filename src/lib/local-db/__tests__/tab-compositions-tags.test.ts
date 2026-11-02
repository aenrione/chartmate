import {describe, it, expect, vi, beforeEach} from 'vitest';

// A recording Kysely stand-in: every query-builder call is logged so tests can
// assert which tables were touched, with which arguments, in which order.
type Call = {method: string; args: unknown[]};
type Op = {kind: 'select' | 'insert' | 'update' | 'delete'; table: string; calls: Call[]};

function makeDb(opts: {
  rowsByTable?: Record<string, unknown[] | ((op: Op) => unknown[])>;
  firstByTable?: Record<string, unknown>;
  insertId?: number;
} = {}) {
  const ops: Op[] = [];
  const builder = (op: Op) => {
    const self: Record<string, unknown> = {};
    for (const method of ['values', 'set', 'where', 'select', 'selectAll', 'orderBy', 'groupBy', 'limit']) {
      self[method] = vi.fn((...args: unknown[]) => { op.calls.push({method, args}); return self; });
    }
    self.execute = vi.fn(async () => {
      if (op.kind !== 'select') return [];
      const rows = opts.rowsByTable?.[op.table] ?? [];
      return typeof rows === 'function' ? rows(op) : rows;
    });
    self.executeTakeFirst = vi.fn(async () => opts.firstByTable?.[op.table] ?? null);
    self.executeTakeFirstOrThrow = vi.fn(async () => ({insertId: BigInt(opts.insertId ?? 1)}));
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
const opsOn = (ops: Op[], table: string) => ops.filter(o => o.table === table);

vi.mock('../client', () => ({getLocalDb: vi.fn()}));

import {getLocalDb} from '../client';
import {
  addTagToCompositions,
  attachTags,
  deleteComposition,
  deleteCompositionBatch,
  getCompositionTags,
  getSavedCompositions,
  listAllCompositionTags,
  loadComposition,
  removeTagFromCompositions,
  saveComposition,
  setCompositionTags,
  updateCompositionMeta,
  type TabComposition,
} from '../tab-compositions';

const mockGet = vi.mocked(getLocalDb);

function useDb(opts: Parameters<typeof makeDb>[0] = {}) {
  const mock = makeDb(opts);
  mockGet.mockResolvedValue(mock.db as any);
  return mock;
}

const COMP_ROW = {
  id: 7, title: 'Entre dos aguas', artist: 'Paco de Lucía', album: '', tempo: 120,
  instrument: 'guitar', preview_image: null, youtube_url: null, is_saved: 1,
  saved_at: '2026-01-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const META = {title: 'T', artist: 'A', album: '', tempo: 100, instrument: 'guitar'};

beforeEach(() => vi.clearAllMocks());

describe('setCompositionTags', () => {
  it('replaces the set: deletes old rows, then inserts the normalized tags', async () => {
    const {ops} = useDb();
    const stored = await setCompositionTags(7, ['  Flamenco ', 'flamenco', '', 'To Learn']);

    expect(stored).toEqual(['Flamenco', 'To Learn']);
    expect(ops.map(o => `${o.kind}:${o.table}`)).toEqual(['delete:composition_tags', 'insert:composition_tags']);
    expect(argsOf(ops[0], 'where')).toEqual([['composition_id', '=', 7]]);
    expect(argsOf(ops[1], 'values')).toEqual([[
      [{composition_id: 7, tag: 'Flamenco'}, {composition_id: 7, tag: 'To Learn'}],
    ]]);
  });

  it('only deletes when the new set is empty', async () => {
    const {ops} = useDb();
    expect(await setCompositionTags(7, ['  ', ''])).toEqual([]);
    expect(ops.map(o => `${o.kind}:${o.table}`)).toEqual(['delete:composition_tags']);
  });
});

describe('getCompositionTags', () => {
  it('does not query for an empty id list', async () => {
    const {db} = useDb();
    expect((await getCompositionTags([])).size).toBe(0);
    expect(db.selectFrom).not.toHaveBeenCalled();
  });

  it('groups rows by composition id', async () => {
    useDb({rowsByTable: {composition_tags: [
      {composition_id: 1, tag: 'a'}, {composition_id: 2, tag: 'b'}, {composition_id: 1, tag: 'c'},
    ]}});
    const byId = await getCompositionTags([1, 2, 3]);
    expect(byId.get(1)).toEqual(['a', 'c']);
    expect(byId.get(2)).toEqual(['b']);
    expect(byId.has(3)).toBe(false);
  });

  it('queries in chunks so it stays under the SQLite parameter limit', async () => {
    const {ops} = useDb();
    const ids = Array.from({length: 1200}, (_, i) => i + 1);
    await getCompositionTags(ids);

    const chunks = opsOn(ops, 'composition_tags').map(o => argsOf(o, 'where')[0][2] as number[]);
    expect(chunks.map(c => c.length)).toEqual([500, 500, 200]);
    expect(chunks.flat()).toEqual(ids);
  });
});

describe('attachTags', () => {
  it('fills tags and gives untagged compositions an empty list', async () => {
    useDb({rowsByTable: {composition_tags: [{composition_id: 1, tag: 'x'}]}});
    const comps = [{id: 1, tags: []}, {id: 2, tags: []}] as unknown as TabComposition[];
    const out = await attachTags(comps);
    expect(out.map(c => c.tags)).toEqual([['x'], []]);
  });
});

describe('listing functions return tags', () => {
  it('getSavedCompositions attaches tags', async () => {
    useDb({rowsByTable: {
      tab_compositions: [COMP_ROW],
      composition_tags: [{composition_id: 7, tag: 'Flamenco'}],
    }});
    const [comp] = await getSavedCompositions('guitar');
    expect(comp.tags).toEqual(['Flamenco']);
  });

  it('loadComposition attaches tags', async () => {
    useDb({
      firstByTable: {tab_compositions: {...COMP_ROW, score_data: [1, 2, 3]}},
      rowsByTable: {composition_tags: [{composition_id: 7, tag: 'Rumba'}]},
    });
    const loaded = await loadComposition(7);
    expect(loaded?.meta.tags).toEqual(['Rumba']);
  });
});

describe('updateCompositionMeta', () => {
  it('leaves tags alone when tags is omitted', async () => {
    const {ops} = useDb();
    await updateCompositionMeta(7, META);
    expect(opsOn(ops, 'composition_tags')).toEqual([]);
  });

  it('replaces tags when given', async () => {
    const {ops} = useDb();
    await updateCompositionMeta(7, {...META, tags: ['b', 'B', 'a']});
    const [del, ins] = opsOn(ops, 'composition_tags');
    expect(del.kind).toBe('delete');
    expect(argsOf(ins, 'values')[0][0]).toEqual([
      {composition_id: 7, tag: 'b'}, {composition_id: 7, tag: 'a'},
    ]);
  });

  it('clears tags when given an empty list', async () => {
    const {ops} = useDb();
    await updateCompositionMeta(7, {...META, tags: []});
    expect(opsOn(ops, 'composition_tags').map(o => o.kind)).toEqual(['delete']);
  });
});

describe('saveComposition', () => {
  it('stores tags for a new composition under its insert id', async () => {
    const {ops} = useDb({insertId: 42});
    const id = await saveComposition(new ArrayBuffer(0), {...META, tags: ['x']});
    expect(id).toBe(42);
    const ins = opsOn(ops, 'composition_tags').find(o => o.kind === 'insert')!;
    expect(argsOf(ins, 'values')[0][0]).toEqual([{composition_id: 42, tag: 'x'}]);
  });

  it('does not touch tags when saving an existing composition without tags', async () => {
    const {ops} = useDb();
    await saveComposition(new ArrayBuffer(0), {...META, id: 7});
    expect(opsOn(ops, 'composition_tags')).toEqual([]);
  });
});

describe('deleting compositions removes their tags', () => {
  it('deleteComposition deletes tags before the composition', async () => {
    const {ops} = useDb();
    await deleteComposition(7);
    expect(ops.map(o => `${o.kind}:${o.table}`)).toEqual(['delete:composition_tags', 'delete:tab_compositions']);
    expect(argsOf(ops[0], 'where')).toEqual([['composition_id', '=', 7]]);
  });

  it('deleteCompositionBatch deletes tags for every id', async () => {
    const {ops} = useDb();
    await deleteCompositionBatch([1, 2]);
    expect(ops.map(o => `${o.kind}:${o.table}`)).toEqual(['delete:composition_tags', 'delete:tab_compositions']);
    expect(argsOf(ops[0], 'where')).toEqual([['composition_id', 'in', [1, 2]]]);
  });

  it('deleteCompositionBatch chunks large selections, tags before rows in each chunk', async () => {
    const {ops} = useDb();
    await deleteCompositionBatch(Array.from({length: 600}, (_, i) => i + 1));
    expect(ops.map(o => `${o.kind}:${o.table}:${(argsOf(o, 'where')[0][2] as number[]).length}`)).toEqual([
      'delete:composition_tags:500', 'delete:tab_compositions:500',
      'delete:composition_tags:100', 'delete:tab_compositions:100',
    ]);
  });

  it('deleteCompositionBatch does nothing for no ids', async () => {
    const {db} = useDb();
    await deleteCompositionBatch([]);
    expect(db.deleteFrom).not.toHaveBeenCalled();
  });
});

describe('addTagToCompositions', () => {
  it('adds the trimmed tag only to compositions that lack it (ignoring case)', async () => {
    const {ops} = useDb({rowsByTable: {composition_tags: [{composition_id: 1, tag: 'TO LEARN'}]}});
    const added = await addTagToCompositions([1, 2, 3, 2], '  to learn ');
    expect(added).toBe(2);
    const ins = ops.find(o => o.kind === 'insert')!;
    expect(argsOf(ins, 'values')[0][0]).toEqual([
      {composition_id: 2, tag: 'to learn'}, {composition_id: 3, tag: 'to learn'},
    ]);
  });

  it('does not write for a blank tag or no ids', async () => {
    const {db} = useDb();
    expect(await addTagToCompositions([1], '   ')).toBe(0);
    expect(await addTagToCompositions([], 'x')).toBe(0);
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('does not write when every composition already has it', async () => {
    const {db} = useDb({rowsByTable: {composition_tags: [{composition_id: 1, tag: 'x'}]}});
    expect(await addTagToCompositions([1], 'X')).toBe(0);
    expect(db.insertInto).not.toHaveBeenCalled();
  });
});

describe('removeTagFromCompositions', () => {
  it('deletes each stored spelling that matches ignoring case', async () => {
    const {ops} = useDb({rowsByTable: {composition_tags: [
      {composition_id: 1, tag: 'Canción'}, {composition_id: 1, tag: 'rock'}, {composition_id: 2, tag: 'rock'},
    ]}});
    const removed = await removeTagFromCompositions([1, 2], 'CANCIÓN');
    expect(removed).toBe(1);
    const dels = ops.filter(o => o.kind === 'delete');
    expect(dels).toHaveLength(1);
    expect(argsOf(dels[0], 'where')).toEqual([['composition_id', '=', 1], ['tag', 'in', ['Canción']]]);
  });

  it('does not write for a blank tag', async () => {
    const {db} = useDb();
    expect(await removeTagFromCompositions([1], ' ')).toBe(0);
    expect(db.deleteFrom).not.toHaveBeenCalled();
  });
});

describe('listAllCompositionTags', () => {
  it('returns tags with numeric counts', async () => {
    useDb({rowsByTable: {composition_tags: [{tag: 'a', count: '3'}, {tag: 'b', count: 1}]}});
    expect(await listAllCompositionTags()).toEqual([{tag: 'a', count: 3}, {tag: 'b', count: 1}]);
  });
});
