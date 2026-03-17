import {Suspense, useCallback, useEffect, useMemo, useState} from 'react';
import SpotifyTableDownloader, {
  SpotifyChartData,
  SpotifyPlaysRecommendations,
} from '@/components/SpotifyTableDownloader';
import SpotifyLibrarySidebar, {
  SidebarPlaylist,
  SidebarAlbum,
} from '@/components/SpotifyLibrarySidebar';
import {useLocalStorage} from '@/lib/useLocalStorage';
import {Button} from '@/components/ui/button';
import {getLocalDb} from '@/lib/local-db/client';
import {sql} from 'kysely';
import {useData, invalidateData} from '@/lib/suspense-data';
import {useChorusChartDb} from '@/lib/chorusChartDb';
import {scanForInstalledCharts} from '@/lib/local-songs-folder';
import {getSongsFolderPath, clearSongsFolderPath, changeSongsFolder} from '@/lib/songs-folder';
import {useSpotifyLibraryUpdate} from '@/lib/spotify-sdk/SpotifyFetching';
import {toast} from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import SpotifyLoaderCard from './SpotifyLoaderCard';
import LocalScanLoaderCard from './LocalScanLoaderCard';
import UpdateChorusLoaderCard from './UpdateChorusLoaderCard';
import {
  ChorusCharts,
  SpotifyAlbums,
  SpotifyPlaylists,
} from '@/lib/local-db/types';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {FileMusic, RefreshCw} from 'lucide-react';
import {useSpotifyAuth} from '@/contexts/SpotifyAuthContext';
import {initiateSpotifyLogin, handleSpotifyCallback} from '@/lib/spotify-auth';
import {invalidateSpotifySdkCache} from '@/lib/spotify-sdk/ClientInstance';


function ConnectSpotifyCard() {
  const [callbackUrl, setCallbackUrl] = useState('');
  const [error, setError] = useState('');
  const {refresh} = useSpotifyAuth();

  const handleManualCallback = async () => {
    if (!callbackUrl.startsWith('chartmate://auth/callback')) {
      setError('URL must start with chartmate://auth/callback');
      return;
    }
    try {
      await handleSpotifyCallback(callbackUrl);
      invalidateSpotifySdkCache();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Callback failed');
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Connect Spotify</CardTitle>
        <CardDescription>
          Sign in with Spotify to scan your library for charts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => initiateSpotifyLogin()}>
          Connect with Spotify
        </Button>
        {import.meta.env.DEV && (
          <div className="space-y-2 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              Dev mode: paste the <code>chartmate://auth/callback?code=...</code> URL from the browser address bar after authorizing.
            </p>
            <input
              type="text"
              value={callbackUrl}
              onChange={e => { setCallbackUrl(e.target.value); setError(''); }}
              placeholder="chartmate://auth/callback?code=..."
              className="w-full px-3 py-2 text-sm border rounded-md"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button variant="outline" size="sm" onClick={handleManualCallback} disabled={!callbackUrl}>
              Submit Callback
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Spotify() {
  const {isConnected} = useSpotifyAuth();

  if (!isConnected) {
    return <ConnectSpotifyCard />;
  }

  return (
    <div className="flex flex-1 flex-col w-full overflow-y-hidden">
      <LoggedIn />
    </div>
  );
}

type Status = {
  status:
    | 'not-started'
    | 'scanning'
    | 'done-scanning'
    | 'fetching-spotify-data'
    | 'songs-from-encore'
    | 'finding-matches'
    | 'done';
  songsCounted: number;
};

async function hasCachedSpotifyData(): Promise<boolean> {
  const db = await getLocalDb();
  // Check for synced Spotify data (tracks in DB), not just chart matches.
  // This ensures results view shows even when there are zero chart matches.
  const row = await db
    .selectFrom('spotify_tracks')
    .select(sql<number>`1`.as('exists'))
    .limit(1)
    .executeTakeFirst();
  return row != null;
}

const SPOTIFY_DATA_KEY = 'spotify-history-tracks-data';

function LoggedIn() {
  const [status, setStatus] = useState<Status>({
    status: 'not-started',
    songsCounted: 0,
  });

  const [spotifyLibraryProgress, updateSpotifyLibrary] =
    useSpotifyLibraryUpdate();
  const [chorusChartProgress, fetchChorusCharts] = useChorusChartDb();

  const [started, setStarted] = useState(false);
  const [hasCached, setHasCached] = useState<boolean | null>(null);
  const [hasFolder, setHasFolder] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([hasCachedSpotifyData(), getSongsFolderPath()]).then(
      ([cached, folder]) => {
        setHasCached(cached);
        setHasFolder(!!folder);
      },
    );
  }, []);

  const calculate = useCallback(async () => {
    const abortController = new AbortController();

    setStarted(true);

    const updateSpotifyLibraryPromise = updateSpotifyLibrary(abortController, {
      concurrency: 3,
    });

    const chorusChartsPromise = fetchChorusCharts(abortController);

    setStatus({status: 'scanning', songsCounted: 0});

    try {
      await scanForInstalledCharts(() => {
        setStatus(prevStatus => ({
          ...prevStatus,
          songsCounted: prevStatus.songsCounted + 1,
        }));
      });
      setHasFolder(true);
      setStatus(prevStatus => ({...prevStatus, status: 'done-scanning'}));
      await pause();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'User canceled picker') {
        toast.info('Directory picker canceled');
      } else if (message.includes('forbidden path')) {
        await clearSongsFolderPath();
        setHasFolder(false);
        toast.error(
          'The previously selected folder is no longer accessible. Please select your Songs folder again.',
          {duration: 8000},
        );
      } else {
        toast.error('Error scanning local charts', {duration: 8000});
      }
      setStatus({status: 'not-started', songsCounted: 0});
      setStarted(false);
      return;
    }

    await Promise.all([chorusChartsPromise, updateSpotifyLibraryPromise]);

    // Ensure chart matches are recalculated after both spotify tracks
    // and chorus charts are fully synced to the database
    const {recalculateTrackChartMatches} = await import('@/lib/local-db/queries');
    await recalculateTrackChartMatches();

    invalidateData(SPOTIFY_DATA_KEY);
    invalidateData(SIDEBAR_DATA_KEY);
    setHasCached(true);
    setStatus(prevStatus => ({
      ...prevStatus,
      status: 'done',
    }));
  }, []);

  const handleChangeFolder = useCallback(async () => {
    try {
      await changeSongsFolder();
    } catch {
      // User canceled the picker
      return;
    }
    calculate();
  }, [calculate]);

  // Auto-trigger scan when folder is saved but no cached results
  useEffect(() => {
    if (hasFolder && !hasCached && !started) {
      calculate();
    }
  }, [hasFolder, hasCached]); // eslint-disable-line react-hooks/exhaustive-deps

  const showCachedResults = hasCached && !started;
  const showScanProgress =
    started &&
    !(
      spotifyLibraryProgress.updateStatus === 'complete' &&
      status.status === 'done'
    );
  const showResultsAfterScan = status.status === 'done';

  if (hasCached === null || hasFolder === null) {
    return null;
  }

  return (
    <>
      {!started && !hasCached && !hasFolder && <ScanLocalFoldersCTACard onClick={calculate} />}

      {showScanProgress && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SpotifyLoaderCard progress={spotifyLibraryProgress} />
          <div className="space-y-4">
            <LocalScanLoaderCard
              count={status.songsCounted}
              isScanning={status.status === 'scanning'}
            />
            <UpdateChorusLoaderCard progress={chorusChartProgress} />
          </div>
        </div>
      )}

      {(showCachedResults || showResultsAfterScan) && (
        <Suspense fallback={<div>Loading...</div>}>
          <SpotifyHistory onRescan={calculate} onChangeFolder={handleChangeFolder} />
        </Suspense>
      )}
    </>
  );
}

type PickedChorusCharts = Pick<
  ChorusCharts,
  | 'md5'
  | 'name'
  | 'artist'
  | 'charter'
  | 'diff_drums'
  | 'diff_guitar'
  | 'diff_bass'
  | 'diff_keys'
  | 'diff_drums_real'
  | 'modified_time'
  | 'song_length'
  | 'has_video_background'
  | 'album_art_md5'
  | 'group_id'
> & {
  isInstalled: number;
};

type PickedSpotifyPlaylists = Pick<
  SpotifyPlaylists,
  | 'id'
  | 'snapshot_id'
  | 'name'
  | 'collaborative'
  | 'owner_display_name'
  | 'owner_external_url'
  | 'total_tracks'
  | 'updated_at'
>;

type PickedSpotifyAlbums = Pick<
  SpotifyAlbums,
  'id' | 'name' | 'artist_name' | 'total_tracks' | 'updated_at'
>;

async function getSidebarData() {
  const db = await getLocalDb();

  const [playlists, albums] = await Promise.all([
    db
      .selectFrom('spotify_playlists as p')
      .leftJoin('spotify_playlist_tracks as pt', 'pt.playlist_id', 'p.id')
      .leftJoin(
        'spotify_track_chart_matches as m',
        'm.spotify_id',
        'pt.track_id',
      )
      .select([
        'p.id',
        'p.name',
        'p.total_tracks',
        sql<number>`COUNT(DISTINCT m.spotify_id)`.as('match_count'),
      ])
      .groupBy('p.id')
      .execute(),
    db
      .selectFrom('spotify_albums as a')
      .leftJoin('spotify_album_tracks as at', 'at.album_id', 'a.id')
      .leftJoin(
        'spotify_track_chart_matches as m',
        'm.spotify_id',
        'at.track_id',
      )
      .select([
        'a.id',
        'a.name',
        'a.artist_name',
        'a.total_tracks',
        sql<number>`COUNT(DISTINCT m.spotify_id)`.as('match_count'),
      ])
      .groupBy('a.id')
      .execute(),
  ]);

  return {playlists, albums};
}

const SIDEBAR_DATA_KEY = 'spotify-sidebar-data';

async function getData() {
  const db = await getLocalDb();

  const before = performance.now();

  const result = await db
    .with('matched_tracks', qb =>
      qb
        .selectFrom('spotify_track_chart_matches as track_chart_link')
        .innerJoin(
          'spotify_tracks as track',
          'track.id',
          'track_chart_link.spotify_id',
        )
        .select([
          'track.id as spotify_track_id',
          'track.name as spotify_track_name',
          'track.artist as spotify_artist_name',
        ])
        .distinct(),
    )

    .with('chart_aggregates', qb =>
      qb
        .selectFrom(sub =>
          sub
            .selectFrom('spotify_track_chart_matches as link')
            .innerJoin('chorus_charts as chart', 'chart.md5', 'link.chart_md5')
            .select([
              'link.spotify_id as spotify_track_id',
              'chart.md5 as chart_md5',
              'chart.name as chart_name',
              'chart.artist as chart_artist_name',
              'chart.charter as chart_charter_name',
              'chart.diff_drums as difficulty_drums',
              'chart.diff_guitar as difficulty_guitar',
              'chart.diff_bass as difficulty_bass',
              'chart.diff_keys as difficulty_keys',
              'chart.diff_drums_real as difficulty_drums_real',
              'chart.modified_time as chart_modified_time',
              'chart.song_length as chart_song_length',
              'chart.has_video_background as has_video_background',
              'chart.album_art_md5 as album_art_md5',
              'chart.group_id as chart_group_id',
              sql<number>`
                CASE WHEN EXISTS (
                  SELECT 1
                  FROM local_charts lc
                  WHERE lc.artist_normalized  = chart.artist_normalized
                    AND lc.song_normalized    = chart.name_normalized
                    AND lc.charter_normalized = chart.charter_normalized
                ) THEN 1 ELSE 0 END
              `.as('isInstalled'),
            ])
            .groupBy(['link.spotify_id', 'chart.md5'])
            .as('deduped_charts'),
        )
        .select([
          'deduped_charts.spotify_track_id',
          sql<PickedChorusCharts[]>`
          json_group_array(
            json_object(
              'md5',               ${sql.ref('deduped_charts.chart_md5')},
              'name',              ${sql.ref('deduped_charts.chart_name')},
              'artist',            ${sql.ref('deduped_charts.chart_artist_name')},
              'charter',           ${sql.ref('deduped_charts.chart_charter_name')},
              'diff_drums',        ${sql.ref('deduped_charts.difficulty_drums')},
              'diff_guitar',       ${sql.ref('deduped_charts.difficulty_guitar')},
              'diff_bass',         ${sql.ref('deduped_charts.difficulty_bass')},
              'diff_keys',         ${sql.ref('deduped_charts.difficulty_keys')},
              'diff_drums_real',   ${sql.ref('deduped_charts.difficulty_drums_real')},
              'modified_time',     ${sql.ref('deduped_charts.chart_modified_time')},
              'song_length',       ${sql.ref('deduped_charts.chart_song_length')},
              'hasVideoBackground',${sql.ref('deduped_charts.has_video_background')},
              'albumArtMd5',       ${sql.ref('deduped_charts.album_art_md5')},
              'group_id',          ${sql.ref('deduped_charts.chart_group_id')},
              'isInstalled',       ${sql.ref('deduped_charts.isInstalled')}
            )
          )
        `.as('matching_charts'),
        ])
        .groupBy('deduped_charts.spotify_track_id'),
    )

    .with('playlist_aggregates', qb =>
      qb
        .selectFrom('spotify_playlist_tracks as playlist_link')
        .innerJoin(
          'spotify_playlists as playlist',
          'playlist.id',
          'playlist_link.playlist_id',
        )
        .select([
          'playlist_link.track_id as spotify_track_id',
          sql<PickedSpotifyPlaylists[]>`
          json_group_array(
            json_object(
              'id',                ${sql.ref('playlist.id')},
              'snapshot_id',       ${sql.ref('playlist.snapshot_id')},
              'name',              ${sql.ref('playlist.name')},
              'collaborative',     ${sql.ref('playlist.collaborative')},
              'owner_display_name',${sql.ref('playlist.owner_display_name')},
              'owner_external_url',${sql.ref('playlist.owner_external_url')},
              'total_tracks',      ${sql.ref('playlist.total_tracks')},
              'updated_at',        ${sql.ref('playlist.updated_at')}
            )
          )
        `.as('playlist_memberships'),
        ])
        .groupBy('playlist_link.track_id'),
    )

    .with('album_aggregates', qb =>
      qb
        .selectFrom('spotify_album_tracks as album_link')
        .innerJoin('spotify_albums as album', 'album.id', 'album_link.album_id')
        .select([
          'album_link.track_id as spotify_track_id',
          sql<PickedSpotifyAlbums[]>`
          json_group_array(
            json_object(
              'id',           ${sql.ref('album.id')},
              'name',         ${sql.ref('album.name')},
              'artist_name',  ${sql.ref('album.artist_name')},
              'total_tracks', ${sql.ref('album.total_tracks')},
              'updated_at',   ${sql.ref('album.updated_at')}
            )
          )
        `.as('album_memberships'),
        ])
        .groupBy('album_link.track_id'),
    )

    .with('local_chart_flags', qb =>
      qb
        .selectFrom('spotify_track_chart_matches as link')
        .innerJoin('chorus_charts as chart', 'chart.md5', 'link.chart_md5')
        .innerJoin('local_charts as local', join =>
          join
            .onRef('local.artist_normalized', '=', 'chart.artist_normalized')
            .onRef('local.song_normalized', '=', 'chart.name_normalized')
            .onRef('local.charter_normalized', '=', 'chart.charter_normalized'),
        )
        .select([
          'link.spotify_id as spotify_track_id',
          sql<number>`1`.as('is_any_local_chart_installed'),
        ])
        .groupBy('link.spotify_id')
        .distinct(),
    )

    .selectFrom('chart_aggregates as chart_data')
    .innerJoin(
      'matched_tracks as track',
      'track.spotify_track_id',
      'chart_data.spotify_track_id',
    )
    .leftJoin(
      'playlist_aggregates as playlist_data',
      'playlist_data.spotify_track_id',
      'chart_data.spotify_track_id',
    )
    .leftJoin(
      'album_aggregates as album_data',
      'album_data.spotify_track_id',
      'chart_data.spotify_track_id',
    )
    .leftJoin(
      'local_chart_flags as installed_flag',
      'installed_flag.spotify_track_id',
      'chart_data.spotify_track_id',
    )
    .select([
      'track.spotify_track_id',
      'track.spotify_track_name',
      'track.spotify_artist_name',
      sql<number>`COALESCE(installed_flag.is_any_local_chart_installed, 0)`.as(
        'is_any_local_chart_installed',
      ),
      sql<PickedChorusCharts[]>`chart_data.matching_charts`.as(
        'matching_charts',
      ),
      sql<
        PickedSpotifyPlaylists[]
      >`COALESCE(playlist_data.playlist_memberships, json('[]'))`.as(
        'playlist_memberships',
      ),
      sql<
        PickedSpotifyAlbums[]
      >`COALESCE(album_data.album_memberships, json('[]'))`.as(
        'album_memberships',
      ),
    ])
    .where('spotify_track_name', '!=', '')
    .where('spotify_artist_name', '!=', '')
    .orderBy('track.spotify_artist_name')
    .orderBy('track.spotify_track_name')
    .execute();

  const after = performance.now();
  console.log('query time', after - before, 'ms');
  return result;
}

function SpotifyHistory({onRescan, onChangeFolder}: {onRescan: () => void; onChangeFolder: () => void}) {
  const {data} = useData({
    key: SPOTIFY_DATA_KEY,
    fn: getData,
  });

  const {data: sidebarData} = useData({
    key: SIDEBAR_DATA_KEY,
    fn: getSidebarData,
  });

  // Memoize songs to avoid recreating the array on every render,
  // which would invalidate all downstream useMemo dependencies.
  const songs: SpotifyPlaysRecommendations[] = useMemo(() =>
    data.map(item => {
      return {
        spotifyTrackId: item.spotify_track_id,
        artist: item.spotify_artist_name,
        song: item.spotify_track_name,
        isAnyInstalled: item.is_any_local_chart_installed === 1,
        matchingCharts: item.matching_charts.map((chart): SpotifyChartData => {
          return {
            ...chart,
            // JSON keys from json_object use camelCase for these fields
            albumArtMd5: (chart as any).albumArtMd5 ?? chart.album_art_md5 ?? '',
            hasVideoBackground: (chart as any).hasVideoBackground === 1 || chart.has_video_background === 1,
            isInstalled: chart.isInstalled === 1,
            modifiedTime: chart.modified_time,
            file: `https://files.enchor.us/${chart.md5}.sng`,
          };
        }),
        playlistMemberships: item.playlist_memberships,
        albumMemberships: item.album_memberships,
      };
    }),
  [data]);

  // Build sidebar data from database query (shows all playlists/albums,
  // not just those with chart matches)
  const sidebarPlaylists: SidebarPlaylist[] = useMemo(() =>
    sidebarData.playlists.map(p => ({
      id: p.id,
      name: p.name,
      matchCount: Number(p.match_count),
      totalTracks: Number(p.total_tracks),
    })),
  [sidebarData.playlists]);

  const sidebarAlbums: SidebarAlbum[] = useMemo(() =>
    sidebarData.albums.map(a => ({
      id: a.id,
      name: a.name,
      artistName: a.artist_name,
      matchCount: Number(a.match_count),
      totalTracks: Number(a.total_tracks),
    })),
  [sidebarData.albums]);

  // Selection state: empty Set means "All Library"
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(
    'chartmate:sidebar-collapsed',
    false,
  );

  // Filter songs based on selection
  const filteredSongs = useMemo(() => {
    if (selectedIds.size === 0) return songs;
    return songs.filter(song => {
      const playlistIds = (song.playlistMemberships ?? []).map(p => p.id);
      const albumIds = (song.albumMemberships ?? []).map(a => a.id);
      return [...playlistIds, ...albumIds].some(id => selectedIds.has(id));
    });
  }, [songs, selectedIds]);

  // Build context string for empty state
  const emptyContext = useMemo(() => {
    if (selectedIds.size === 0) return undefined;
    if (selectedIds.size > 2) return 'the selected playlists and albums';
    const names: string[] = [];
    for (const id of selectedIds) {
      const playlist = sidebarPlaylists.find(p => p.id === id);
      if (playlist) {
        names.push(`"${playlist.name}"`);
        continue;
      }
      const album = sidebarAlbums.find(a => a.id === id);
      if (album) {
        names.push(`"${album.name}"`);
      }
    }
    return names.join(' and ');
  }, [selectedIds, sidebarPlaylists, sidebarAlbums]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <SpotifyLibrarySidebar
        playlists={sidebarPlaylists}
        albums={sidebarAlbums}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <div className="flex justify-end gap-2 mb-2 px-1">
          <Button variant="outline" size="sm" onClick={onChangeFolder}>
            Change Folder
          </Button>
          <Button variant="outline" size="sm" onClick={onRescan}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Rescan Library
          </Button>
        </div>
        {filteredSongs.length === 0 ? (
          <NoMatches context={emptyContext} />
        ) : (
          <SpotifyTableDownloader tracks={filteredSongs} showPreview={true} />
        )}
      </div>
    </div>
  );
}

async function pause() {
  await new Promise(resolve => {
    setTimeout(resolve, 10);
  });
}

function ScanLocalFoldersCTACard({onClick}: {onClick: () => void}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <FileMusic className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-semibold">Select Local Songs Folder</h2>
        <p className="text-sm text-muted-foreground">
          Scan your local songs folder to find installed charts, enabling you to
          avoid downloading duplicates. Downloading a chart installs it into
          this folder &mdash; no need to copy from Downloads!
        </p>
      </div>
      <Button onClick={onClick}>Select Songs Folder</Button>
    </div>
  );
}

export function NoMatches({context}: {context?: string}) {
  return (
    <div className="flex justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileMusic />
          </EmptyMedia>
          <EmptyTitle>No Matching Charts</EmptyTitle>
          <EmptyDescription>
            {context
              ? `No matching charts found in ${context}.`
              : "We couldn't find any matching charts for your Spotify library."}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}>
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
