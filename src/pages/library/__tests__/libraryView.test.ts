import {describe, it, expect} from 'vitest';
import {
  DEFAULT_LIBRARY_PREFS,
  UNKNOWN_ARTIST_LABEL,
  UNTAGGED_LABEL,
  countTags,
  filterByTags,
  filterByArchiveScope,
  groupId,
  groupItems,
  parseLibraryPrefs,
  visibleInGroups,
  toggleTagFilter,
} from '../libraryView';

type Item = {id: number; artist: string; tags: string[]};

const getTags = (i: Item) => i.tags;
const accessors = {getArtist: (i: Item) => i.artist, getTags};

const A: Item = {id: 1, artist: 'Paco de Lucía', tags: ['Flamenco', 'to learn']};
const B: Item = {id: 2, artist: 'paco de lucía', tags: ['flamenco']};
const C: Item = {id: 3, artist: 'Andrés Segovia', tags: []};
const D: Item = {id: 4, artist: '  ', tags: ['Classical', 'To Learn']};

const ids = (items: Item[]) => items.map(i => i.id);

describe('filterByTags', () => {
  it('returns every item when no tag is selected', () => {
    expect(ids(filterByTags([A, B, C, D], getTags, []))).toEqual([1, 2, 3, 4]);
  });

  it('matches tags ignoring case', () => {
    expect(ids(filterByTags([A, B, C, D], getTags, ['FLAMENCO']))).toEqual([1, 2]);
  });

  it('requires every selected tag (AND)', () => {
    expect(ids(filterByTags([A, B, C, D], getTags, ['flamenco', 'to learn']))).toEqual([1]);
  });

  it('returns nothing for a tag no item has', () => {
    expect(filterByTags([A, B, C, D], getTags, ['jazz'])).toEqual([]);
  });

  it('returns a new array', () => {
    const items = [A];
    expect(filterByTags(items, getTags, [])).not.toBe(items);
  });
});

describe('toggleTagFilter', () => {
  it('adds a tag that is not selected', () => {
    expect(toggleTagFilter(['rock'], 'Blues')).toEqual(['rock', 'Blues']);
  });

  it('removes a selected tag ignoring case', () => {
    expect(toggleTagFilter(['Rock', 'blues'], 'rock')).toEqual(['blues']);
  });
});

describe('countTags', () => {
  it('counts distinct tags ignoring case, keeps the first spelling, sorts by name', () => {
    expect(countTags([A, B, C, D], getTags)).toEqual([
      {tag: 'Classical', count: 1},
      {tag: 'Flamenco', count: 2},
      {tag: 'to learn', count: 2},
    ]);
  });

  it('counts an item once even if it repeats a tag', () => {
    expect(countTags([{id: 9, artist: '', tags: ['x', 'X']}], getTags)).toEqual([{tag: 'x', count: 1}]);
  });
});

describe('groupItems', () => {
  it('returns one group with every item for none', () => {
    const groups = groupItems([A, B, C], 'none', accessors);
    expect(groups).toHaveLength(1);
    expect(ids(groups[0].items)).toEqual([1, 2, 3]);
  });

  it('groups by artist ignoring case, unknown artist last', () => {
    const groups = groupItems([D, A, C, B], 'artist', accessors);
    expect(groups.map(g => g.label)).toEqual(['Andrés Segovia', 'Paco de Lucía', UNKNOWN_ARTIST_LABEL]);
    expect(groups.map(g => ids(g.items))).toEqual([[3], [1, 2], [4]]);
  });

  it('labels an artist group with the first spelling seen', () => {
    const groups = groupItems([A, B], 'artist', accessors);
    expect(groups[0].label).toBe('Paco de Lucía');
  });

  it('puts an item with several tags in each tag group and untagged last', () => {
    const groups = groupItems([A, B, C, D], 'tag', accessors);
    expect(groups.map(g => g.label)).toEqual(['Classical', 'Flamenco', 'to learn', UNTAGGED_LABEL]);
    expect(groups.map(g => ids(g.items))).toEqual([[4], [1, 2], [1, 4], [3]]);
  });

  it('keeps the incoming item order inside a group', () => {
    const groups = groupItems([B, A], 'tag', accessors);
    const flamenco = groups.find(g => g.label.toLowerCase() === 'flamenco')!;
    expect(ids(flamenco.items)).toEqual([2, 1]);
  });

  it('returns no groups for no items when grouping', () => {
    expect(groupItems([], 'tag', accessors)).toEqual([]);
    expect(groupItems([], 'artist', accessors)).toEqual([]);
  });

  it('gives each group a unique key', () => {
    const groups = groupItems([A, B, C, D], 'tag', accessors);
    expect(new Set(groups.map(g => g.key)).size).toBe(groups.length);
  });
});

describe('parseLibraryPrefs', () => {
  it('falls back to defaults for missing or invalid data', () => {
    expect(parseLibraryPrefs(null)).toEqual(DEFAULT_LIBRARY_PREFS);
    expect(parseLibraryPrefs('grid')).toEqual(DEFAULT_LIBRARY_PREFS);
    expect(parseLibraryPrefs({view: 'table', groupBy: 'album', tagFilter: 'rock'})).toEqual(DEFAULT_LIBRARY_PREFS);
  });

  it('keeps valid values and normalizes the tag filter', () => {
    expect(parseLibraryPrefs({view: 'list', groupBy: 'tag', tagFilter: [' Rock ', 'rock', 5, 'Blues']})).toEqual({
      view: 'list',
      groupBy: 'tag',
      tagFilter: ['Rock', 'Blues'],
    });
  });
});

describe('visibleInGroups (select-all scope)', () => {
  const getId = (i: Item) => String(i.id);
  const tagGroups = groupItems([A, B, C, D], 'tag', accessors);
  const keyOf = (label: string) => tagGroups.find(g => g.label === label)!.key;

  it('returns every item when not grouping, even with collapsed ids around', () => {
    expect(ids(visibleInGroups([A, B, C], 'none', new Set(['tag:x']), accessors, getId))).toEqual([1, 2, 3]);
  });

  it('lists an item in several tag groups only once', () => {
    expect(ids(visibleInGroups([A, B, C, D], 'tag', new Set(), accessors, getId))).toEqual([4, 1, 2, 3]);
  });

  it('skips items that are only in collapsed groups', () => {
    const collapsed = new Set([groupId('tag', keyOf('Flamenco')), groupId('tag', keyOf(UNTAGGED_LABEL))]);
    // A is still visible through "to learn"; B and C are hidden.
    expect(ids(visibleInGroups([A, B, C, D], 'tag', collapsed, accessors, getId))).toEqual([4, 1]);
  });

  it('ignores collapsed ids from another grouping', () => {
    const collapsed = new Set([groupId('artist', keyOf('Flamenco'))]);
    expect(ids(visibleInGroups([A, B, C, D], 'tag', collapsed, accessors, getId))).toEqual([4, 1, 2, 3]);
  });

  it('works on the already tag-filtered set', () => {
    const filtered = filterByTags([A, B, C, D], getTags, ['to learn']);
    expect(ids(visibleInGroups(filtered, 'artist', new Set(), accessors, getId))).toEqual([1, 4]);
  });
});

describe('filterByArchiveScope', () => {
  type Row = {id: number; archived: boolean};
  const rows: Row[] = [{id: 1, archived: false}, {id: 2, archived: true}, {id: 3, archived: false}];
  const getArchived = (r: Row) => r.archived;

  it('hides archived items in the default library view', () => {
    expect(filterByArchiveScope(rows, false, getArchived).map(r => r.id)).toEqual([1, 3]);
  });

  it('shows only archived items in the archived view', () => {
    expect(filterByArchiveScope(rows, true, getArchived).map(r => r.id)).toEqual([2]);
  });

  it('keeps items that can never be archived out of the archived view', () => {
    const charts = [{id: 9}];
    expect(filterByArchiveScope(charts, true, () => false)).toEqual([]);
    expect(filterByArchiveScope(charts, false, () => false)).toEqual(charts);
  });

  it('does not mutate the input', () => {
    const copy = [...rows];
    filterByArchiveScope(rows, true, getArchived);
    expect(rows).toEqual(copy);
  });
});
