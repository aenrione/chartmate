import {getLocalDb} from './client';
import {rowToComposition, attachTags, COMPOSITION_COLUMNS, COMPOSITION_SORT_MAP, type TabComposition, type CompositionSortOrder, type ArchiveScope} from './tab-compositions';
import type {SavedChartEntry} from './saved-charts';

export type LibraryItem =
  | {sourceType: 'composition'; data: TabComposition}
  | {sourceType: 'chorus'; data: SavedChartEntry};

export async function getDrumsLibraryItems(
  search?: string,
  sort: CompositionSortOrder = 'saved_at_desc',
  scope: ArchiveScope = 'active',
): Promise<LibraryItem[]> {
  const db = await getLocalDb();

  const {col, dir} = COMPOSITION_SORT_MAP[sort];

  let compQuery = db
    .selectFrom('tab_compositions')
    .select(COMPOSITION_COLUMNS)
    .where('is_saved', '=', 1)
    .where('instrument', '=', 'drums')
    .orderBy(col, dir);

  if (scope !== 'all') {
    compQuery = compQuery.where('archived_at', scope === 'archived' ? 'is not' : 'is', null);
  }

  let chartQuery = db
    .selectFrom('saved_charts')
    .selectAll()
    .where('diff_drums', 'is not', null)
    .orderBy('saved_at', 'desc');

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    compQuery = compQuery.where(eb =>
      eb.or([eb('title', 'like', term), eb('artist', 'like', term)])
    );
    chartQuery = chartQuery.where(eb =>
      eb.or([eb('name', 'like', term), eb('artist', 'like', term)])
    );
  }

  // Clone Hero charts can't be archived, so the archived view lists tabs only.
  type ChartRows = Awaited<ReturnType<typeof chartQuery.execute>>;
  const [compRows, chartRows] = await Promise.all([
    compQuery.execute(),
    scope === 'archived' ? Promise.resolve([] as ChartRows) : chartQuery.execute(),
  ]);

  const compositions: LibraryItem[] = (await attachTags(compRows.map(rowToComposition))).map(data => ({
    sourceType: 'composition' as const,
    data,
  }));

  const choruses: LibraryItem[] = chartRows.map(row => ({
    sourceType: 'chorus' as const,
    data: {
      md5: row.md5,
      name: row.name,
      artist: row.artist,
      charter: row.charter,
      albumArtMd5: row.album_art_md5 ?? '',
      diff_drums: row.diff_drums,
      diff_drums_real: row.diff_drums_real,
      diff_guitar: row.diff_guitar,
      diff_bass: row.diff_bass,
      diff_keys: row.diff_keys,
      song_length: row.song_length,
      hasVideoBackground: row.has_video_background === 1,
      modifiedTime: row.modified_time,
      notesData: {} as any,
      file: `https://files.enchor.us/${row.md5}.sng`,
      isDownloaded: row.is_downloaded === 1,
      tabUrl: row.tab_url ?? null,
    },
  }));

  return [...compositions, ...choruses];
}
