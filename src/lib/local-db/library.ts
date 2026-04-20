import {getLocalDb} from './client';
import type {TabComposition, CompositionSortOrder} from './tab-compositions';
import type {SavedChartEntry} from './saved-charts';

export type LibraryItem =
  | {sourceType: 'composition'; data: TabComposition}
  | {sourceType: 'chorus'; data: SavedChartEntry};

export async function getDrumsLibraryItems(
  search?: string,
  sort: CompositionSortOrder = 'saved_at_desc',
): Promise<LibraryItem[]> {
  const db = await getLocalDb();

  const orderCol: Record<CompositionSortOrder, {col: any; dir: 'asc' | 'desc'}> = {
    saved_at_desc: {col: 'saved_at', dir: 'desc'},
    title_asc:     {col: 'title',    dir: 'asc'},
    artist_asc:    {col: 'artist',   dir: 'asc'},
    tempo_asc:     {col: 'tempo',    dir: 'asc'},
  };
  const {col, dir} = orderCol[sort];

  let compQuery = db
    .selectFrom('tab_compositions')
    .select(['id', 'title', 'artist', 'album', 'tempo', 'instrument', 'preview_image', 'youtube_url', 'is_saved', 'saved_at', 'created_at', 'updated_at'])
    .where('is_saved', '=', 1)
    .where('instrument', '=', 'drums')
    .orderBy(col, dir);

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    compQuery = compQuery.where(eb =>
      eb.or([eb('title', 'like', term), eb('artist', 'like', term)])
    );
  }

  const compRows = await compQuery.execute();
  const compositions: LibraryItem[] = compRows.map(r => ({
    sourceType: 'composition' as const,
    data: {
      id: r.id!,
      title: r.title,
      artist: r.artist,
      album: r.album,
      tempo: r.tempo,
      instrument: r.instrument,
      previewImage: r.preview_image ?? null,
      youtubeUrl: r.youtube_url ?? null,
      isSaved: true,
      savedAt: r.saved_at ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
  }));

  let chartQuery = db
    .selectFrom('saved_charts')
    .selectAll()
    .where('diff_drums', 'is not', null)
    .orderBy('saved_at', 'desc');

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    chartQuery = chartQuery.where(eb =>
      eb.or([eb('name', 'like', term), eb('artist', 'like', term)])
    );
  }

  const chartRows = await chartQuery.execute();
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
