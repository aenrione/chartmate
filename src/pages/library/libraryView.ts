// Pure view logic for the library page: tag filter, grouping and stored prefs.
import {normalizeTags, tagKey} from '@/lib/composition-tags';

export type LibraryViewMode = 'grid' | 'list';
export type LibraryGroupBy = 'none' | 'artist' | 'tag';

export type LibraryPrefs = {
  view: LibraryViewMode;
  groupBy: LibraryGroupBy;
  /** Items must carry every tag in this list (AND). Empty means no filter. */
  tagFilter: string[];
};

export const DEFAULT_LIBRARY_PREFS: LibraryPrefs = {view: 'grid', groupBy: 'none', tagFilter: []};

export const UNTAGGED_LABEL = 'Untagged';
export const UNKNOWN_ARTIST_LABEL = 'Unknown artist';

const UNTAGGED_KEY = '\u0000untagged';
const UNKNOWN_ARTIST_KEY = '\u0000unknown-artist';
const ALL_KEY = '\u0000all';

/** Read prefs from the store, falling back to defaults for anything missing or invalid. */
export function parseLibraryPrefs(raw: unknown): LibraryPrefs {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const view: LibraryViewMode = obj.view === 'list' ? 'list' : 'grid';
  const groupBy: LibraryGroupBy =
    obj.groupBy === 'artist' || obj.groupBy === 'tag' ? obj.groupBy : 'none';
  const tagFilter = Array.isArray(obj.tagFilter) ? normalizeTags(obj.tagFilter) : [];
  return {view, groupBy, tagFilter};
}

/** Keep items that carry every selected tag, ignoring case. */
export function filterByTags<T>(
  items: readonly T[],
  getTags: (item: T) => readonly string[],
  selected: readonly string[],
): T[] {
  if (selected.length === 0) return [...items];
  const wanted = selected.map(tagKey);
  return items.filter(item => {
    const have = new Set(getTags(item).map(tagKey));
    return wanted.every(k => have.has(k));
  });
}

/**
 * Keep the items that belong in the current view: the active library hides
 * archived items, the archived view shows only them. Items that cannot be
 * archived (Clone Hero charts report `false`) only ever show in the active view.
 * The queries already scope their results; this also keeps a list that is
 * momentarily stale — right after archiving, before the reload — consistent.
 */
export function filterByArchiveScope<T>(
  items: readonly T[],
  showArchived: boolean,
  getArchived: (item: T) => boolean,
): T[] {
  return items.filter(item => getArchived(item) === showArchived);
}

/** Toggle a tag in the filter list, ignoring case. */
export function toggleTagFilter(selected: readonly string[], tag: string): string[] {
  const key = tagKey(tag);
  return selected.some(t => tagKey(t) === key)
    ? selected.filter(t => tagKey(t) !== key)
    : [...selected, tag];
}

/** Distinct tags across items with how many items carry each, sorted by name. */
export function countTags<T>(
  items: readonly T[],
  getTags: (item: T) => readonly string[],
): {tag: string; count: number}[] {
  const byKey = new Map<string, {tag: string; count: number}>();
  for (const item of items) {
    for (const tag of normalizeTags(getTags(item))) {
      const key = tagKey(tag);
      const entry = byKey.get(key);
      if (entry) entry.count++;
      else byKey.set(key, {tag, count: 1});
    }
  }
  return [...byKey.values()].sort((a, b) => compareLabels(a.tag, b.tag));
}

export type ItemGroup<T> = {key: string; label: string; items: T[]};

/**
 * Group items for display. Groups are sorted by name, with "Unknown artist" and
 * "Untagged" last; items keep their incoming order (the page's sort). With
 * `tag`, an item with several tags appears in each of their groups.
 * `none` returns a single group with key ALL.
 */
export function groupItems<T>(
  items: readonly T[],
  groupBy: LibraryGroupBy,
  accessors: {getArtist: (item: T) => string; getTags: (item: T) => readonly string[]},
): ItemGroup<T>[] {
  if (groupBy === 'none') return [{key: ALL_KEY, label: '', items: [...items]}];

  const groups = new Map<string, ItemGroup<T>>();
  const add = (key: string, label: string, item: T) => {
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, {key, label, items: [item]});
  };

  for (const item of items) {
    if (groupBy === 'artist') {
      const artist = accessors.getArtist(item).trim();
      if (artist) add(tagKey(artist), artist, item);
      else add(UNKNOWN_ARTIST_KEY, UNKNOWN_ARTIST_LABEL, item);
    } else {
      const tags = normalizeTags(accessors.getTags(item));
      if (tags.length === 0) add(UNTAGGED_KEY, UNTAGGED_LABEL, item);
      for (const tag of tags) add(tagKey(tag), tag, item);
    }
  }

  const special = new Set([UNTAGGED_KEY, UNKNOWN_ARTIST_KEY]);
  return [...groups.values()].sort((a, b) => {
    const sa = special.has(a.key);
    const sb = special.has(b.key);
    if (sa !== sb) return sa ? 1 : -1;
    return compareLabels(a.label, b.label);
  });
}

function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, {sensitivity: 'base', numeric: true});
}

/** Stable id of a group across renders, used for its collapsed state. */
export function groupId(groupBy: LibraryGroupBy, key: string): string {
  return `${groupBy}:${key}`;
}

/**
 * The items a viewer can currently see: every item when not grouping, else the
 * items in expanded groups, each once (tag grouping can list an item twice),
 * in first-seen order. Select-all works on this set.
 */
export function visibleInGroups<T>(
  items: readonly T[],
  groupBy: LibraryGroupBy,
  collapsed: ReadonlySet<string>,
  accessors: {getArtist: (item: T) => string; getTags: (item: T) => readonly string[]},
  getId: (item: T) => string,
): T[] {
  if (groupBy === 'none') return [...items];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groupItems(items, groupBy, accessors)) {
    if (collapsed.has(groupId(groupBy, group.key))) continue;
    for (const item of group.items) {
      const id = getId(item);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
  }
  return out;
}
