import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {cn} from '@/lib/utils';
import {getLocalDb} from '@/lib/local-db/client';
import {sql} from 'kysely';
import {useData} from '@/lib/suspense-data';
import SpotifyLibrarySidebar, {
  SidebarPlaylist,
  SidebarAlbum,
} from '@/components/SpotifyLibrarySidebar';
import {useLocalStorage} from '@/lib/useLocalStorage';
import {useSpotifyHistory, makeHistoryKey} from '@/hooks/useSpotifyHistory';
import {useChartResultsCache, useTabResultsCache} from '@/hooks/useTrackResults';
import {toast} from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Search as SearchIcon,
  Loader2,
  MoreVertical,
  Plus,
  X,
} from 'lucide-react';
import {SpotifyPlaylists, SpotifyAlbums} from '@/lib/local-db/types';
import {normalizeStrForMatching} from '@/lib/local-db/normalize';
import {
  getExplorerLists,
  saveToExplorerList,
  isTrackSaved,
} from '@/lib/local-db/explorer-saves';
import {TrackDetailDrawer} from '@/components/TrackDetailDrawer';

type SortKey =
  | 'play-count-desc'
  | 'last-played-desc'
  | 'name-asc'
  | 'artist-asc'
  | 'has-charts';

type FilterKey = 'all' | 'has-charts' | 'has-tabs' | 'never-searched';


export type LibraryTrack = {
  spotifyTrackId: string;
  name: string;
  artist: string;
  duration: number | null;
  hasChartMatch: boolean;
};

const SIDEBAR_DATA_KEY = 'spotify-library-explorer-sidebar';
const PAGE_SIZE = 50;

async function getTracksForSelection(
  playlistIds: string[],
  albumIds: string[],
): Promise<LibraryTrack[]> {
  if (playlistIds.length === 0 && albumIds.length === 0) return [];
  const db = await getLocalDb();

  const inPlaylist =
    playlistIds.length > 0
      ? db
          .selectFrom('spotify_playlist_tracks')
          .select('track_id')
          .where('playlist_id', 'in', playlistIds)
      : null;

  const inAlbum =
    albumIds.length > 0
      ? db
          .selectFrom('spotify_album_tracks')
          .select('track_id')
          .where('album_id', 'in', albumIds)
      : null;

  let trackIds: string[] = [];
  if (inPlaylist && inAlbum) {
    const [p, a] = await Promise.all([inPlaylist.execute(), inAlbum.execute()]);
    trackIds = [...new Set([...p.map(r => r.track_id), ...a.map(r => r.track_id)])];
  } else if (inPlaylist) {
    trackIds = (await inPlaylist.execute()).map(r => r.track_id);
  } else if (inAlbum) {
    trackIds = (await inAlbum.execute()).map(r => r.track_id);
  }

  if (trackIds.length === 0) return [];

  const rows = await db
    .selectFrom('spotify_tracks as st')
    .leftJoin('spotify_track_chart_matches as m', 'm.spotify_id', 'st.id')
    .select([
      'st.id as spotifyTrackId',
      'st.name',
      'st.artist',
      sql<number>`MAX(CASE WHEN m.spotify_id IS NOT NULL THEN 1 ELSE 0 END)`.as('hasChartMatch'),
    ])
    .where('st.id', 'in', trackIds)
    .groupBy('st.id')
    .orderBy('st.artist')
    .orderBy('st.name')
    .execute();

  return rows.map(r => ({
    spotifyTrackId: (r as any).spotifyTrackId,
    name: (r as any).name,
    artist: (r as any).artist,
    duration: null,
    hasChartMatch: Number((r as any).hasChartMatch) === 1,
  }));
}

async function getSidebarData() {
  const db = await getLocalDb();
  const [playlists, albums] = await Promise.all([
    db
      .selectFrom('spotify_playlists as p')
      .leftJoin('spotify_playlist_tracks as pt', 'pt.playlist_id', 'p.id')
      .leftJoin('spotify_track_chart_matches as m', 'm.spotify_id', 'pt.track_id')
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
      .leftJoin('spotify_track_chart_matches as m', 'm.spotify_id', 'at.track_id')
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

function formatDuration(ms: number | null): string {
  if (ms == null) return '';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

export default function SpotifyLibraryExplorer() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground text-sm">Loading...</div>}>
      <ExplorerShell />
    </Suspense>
  );
}

function ExplorerShell() {
  const {data: sidebarData} = useData({key: SIDEBAR_DATA_KEY, fn: getSidebarData});
  const history = useSpotifyHistory();
  const chartCache = useChartResultsCache();
  const tabCache = useTabResultsCache();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage(
    'chartmate:library-explorer-sidebar-collapsed',
    false,
  );
  const [selectedTrack, setSelectedTrack] = useState<LibraryTrack | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('play-count-desc');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const sidebarPlaylists: SidebarPlaylist[] = useMemo(
    () =>
      sidebarData.playlists.map(p => ({
        id: p.id,
        name: p.name,
        matchCount: Number(p.match_count),
        totalTracks: Number(p.total_tracks),
      })),
    [sidebarData.playlists],
  );

  const sidebarAlbums: SidebarAlbum[] = useMemo(
    () =>
      sidebarData.albums.map(a => ({
        id: a.id,
        name: a.name,
        artistName: a.artist_name,
        matchCount: Number(a.match_count),
        totalTracks: Number(a.total_tracks),
      })),
    [sidebarData.albums],
  );

  const selectionKey = useMemo(
    () => Array.from(selectedIds).sort().join('|'),
    [selectedIds],
  );

  const playlistIdSet = useMemo(
    () => new Set(sidebarPlaylists.map(p => p.id)),
    [sidebarPlaylists],
  );
  const albumIdSet = useMemo(
    () => new Set(sidebarAlbums.map(a => a.id)),
    [sidebarAlbums],
  );

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      <SpotifyLibrarySidebar
        playlists={sidebarPlaylists}
        albums={sidebarAlbums}
        selectedIds={selectedIds}
        onSelectionChange={ids => {
          setSelectedIds(ids);
          setSelectedTrack(null);
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
      />

      <div className="flex flex-1 min-w-0 overflow-hidden relative">
        {selectedIds.size === 0 ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Select a playlist or album to explore
          </div>
        ) : (
          <Suspense
            key={selectionKey}
            fallback={
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }>
            <TrackContent
              selectedIds={selectedIds}
              selectionKey={selectionKey}
              playlistIdSet={playlistIdSet}
              albumIdSet={albumIdSet}
              history={history}
              chartCache={chartCache}
              tabCache={tabCache}
              selectedTrack={selectedTrack}
              onSelectTrack={setSelectedTrack}
              sortKey={sortKey}
              filterKey={filterKey}
              searchQuery={searchQuery}
              onSortChange={setSortKey}
              onFilterChange={setFilterKey}
              onSearchChange={setSearchQuery}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function TrackContent({
  selectedIds,
  selectionKey,
  playlistIdSet,
  albumIdSet,
  history,
  chartCache,
  tabCache,
  selectedTrack,
  onSelectTrack,
  sortKey,
  filterKey,
  searchQuery,
  onSortChange,
  onFilterChange,
  onSearchChange,
}: {
  selectedIds: Set<string>;
  selectionKey: string;
  playlistIdSet: Set<string>;
  albumIdSet: Set<string>;
  history: ReturnType<typeof useSpotifyHistory>;
  chartCache: ReturnType<typeof useChartResultsCache>;
  tabCache: ReturnType<typeof useTabResultsCache>;
  selectedTrack: LibraryTrack | null;
  onSelectTrack: (t: LibraryTrack | null) => void;
  sortKey: SortKey;
  filterKey: FilterKey;
  searchQuery: string;
  onSortChange: (v: SortKey) => void;
  onFilterChange: (v: FilterKey) => void;
  onSearchChange: (v: string) => void;
}) {
  const playlistIds = useMemo(
    () => Array.from(selectedIds).filter(id => playlistIdSet.has(id)),
    [selectedIds, playlistIdSet],
  );
  const albumIds = useMemo(
    () => Array.from(selectedIds).filter(id => albumIdSet.has(id)),
    [selectedIds, albumIdSet],
  );

  const {data: tracks} = useData({
    key: ['spotify-explorer-tracks', selectionKey],
    fn: () => getTracksForSelection(playlistIds, albumIds),
  });

  const [page, setPage] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [selectionKey, debouncedSearch, filterKey, sortKey]);

  const maxPlayCount = useMemo(() => {
    let max = 0;
    for (const t of tracks) {
      const entry = history.get(makeHistoryKey(t.artist, t.name));
      if (entry && entry.playCount > max) max = entry.playCount;
    }
    return max;
  }, [tracks, history]);

  const filteredSorted = useMemo(() => {
    let list = tracks;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        t => t.name.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q),
      );
    }

    if (filterKey === 'has-charts') {
      list = list.filter(t => t.hasChartMatch);
    } else if (filterKey === 'has-tabs') {
      list = list.filter(t => {
        const r = tabCache.get(t.artist, t.name);
        return r.state === 'done' && r.tabs.length > 0;
      });
    } else if (filterKey === 'never-searched') {
      list = list.filter(t => tabCache.get(t.artist, t.name).state === 'idle');
    }

    const getPlayCount = (t: LibraryTrack) =>
      history.get(makeHistoryKey(t.artist, t.name))?.playCount ?? 0;
    const getLastPlayed = (t: LibraryTrack) =>
      history.get(makeHistoryKey(t.artist, t.name))?.lastPlayed ?? '';

    const sorted = [...list];
    switch (sortKey) {
      case 'play-count-desc':
        sorted.sort((a, b) => getPlayCount(b) - getPlayCount(a));
        break;
      case 'last-played-desc':
        sorted.sort((a, b) => getLastPlayed(b).localeCompare(getLastPlayed(a)));
        break;
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'artist-asc':
        sorted.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
      case 'has-charts':
        sorted.sort((a, b) => (a.hasChartMatch === b.hasChartMatch ? 0 : a.hasChartMatch ? -1 : 1));
        break;
    }
    return sorted;
  }, [tracks, debouncedSearch, filterKey, sortKey, history, tabCache]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const pageTracks = filteredSorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleTrackClick = useCallback(
    (track: LibraryTrack) => {
      onSelectTrack(selectedTrack?.spotifyTrackId === track.spotifyTrackId ? null : track);
      chartCache.trigger(track.artist, track.name);
    },
    [chartCache, onSelectTrack, selectedTrack],
  );

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden">
      <div
        className={cn(
          'flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-200',
          selectedTrack ? 'mr-[400px]' : '',
        )}>
        <TrackGrid
          tracks={pageTracks}
          history={history}
          maxPlayCount={maxPlayCount}
          tabCache={tabCache}
          selectedTrackId={selectedTrack?.spotifyTrackId ?? null}
          sortKey={sortKey}
          filterKey={filterKey}
          searchQuery={searchQuery}
          onSortChange={onSortChange}
          onFilterChange={onFilterChange}
          onSearchChange={onSearchChange}
          onTrackClick={handleTrackClick}
          totalCount={filteredSorted.length}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      {selectedTrack && (() => {
        const histKey = makeHistoryKey(selectedTrack.artist, selectedTrack.name);
        const histEntry = history.get(histKey);
        const headerExtra = (histEntry?.playCount ?? 0) > 0 ? (
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{histEntry!.playCount} plays</span>
            {histEntry?.lastPlayed && (
              <span>Last: {formatDate(histEntry.lastPlayed)}</span>
            )}
          </div>
        ) : undefined;
        return (
          <TrackDetailDrawer
            track={{id: selectedTrack.spotifyTrackId, artist: selectedTrack.artist, name: selectedTrack.name}}
            chartCache={chartCache}
            tabCache={tabCache}
            headerExtra={headerExtra}
            onClose={() => onSelectTrack(null)}
          />
        );
      })()}
    </div>
  );
}

function TrackGrid({
  tracks,
  history,
  maxPlayCount,
  tabCache,
  selectedTrackId,
  sortKey,
  filterKey,
  searchQuery,
  onSortChange,
  onFilterChange,
  onSearchChange,
  onTrackClick,
  totalCount,
  page,
  totalPages,
  onPageChange,
}: {
  tracks: LibraryTrack[];
  history: ReturnType<typeof useSpotifyHistory>;
  maxPlayCount: number;
  tabCache: ReturnType<typeof useTabResultsCache>;
  selectedTrackId: string | null;
  sortKey: SortKey;
  filterKey: FilterKey;
  searchQuery: string;
  onSortChange: (v: SortKey) => void;
  onFilterChange: (v: FilterKey) => void;
  onSearchChange: (v: string) => void;
  onTrackClick: (t: LibraryTrack) => void;
  totalCount: number;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-4 py-2 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-[280px]">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="h-8 pl-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Sort</span>
          <Select value={sortKey} onValueChange={v => onSortChange(v as SortKey)}>
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="play-count-desc">Play Count ↓</SelectItem>
              <SelectItem value="last-played-desc">Last Played ↓</SelectItem>
              <SelectItem value="name-asc">Name A–Z</SelectItem>
              <SelectItem value="artist-asc">Artist A–Z</SelectItem>
              <SelectItem value="has-charts">Has Charts First</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Filter</span>
          <Select value={filterKey} onValueChange={v => onFilterChange(v as FilterKey)}>
            <SelectTrigger className="h-8 w-[150px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="has-charts">Has Charts</SelectItem>
              <SelectItem value="has-tabs">Has Tabs</SelectItem>
              <SelectItem value="never-searched">Never Searched</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1" />
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {totalCount} tracks
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => onPageChange(page - 1)}
              className="px-2 py-1 text-xs rounded hover:bg-accent disabled:opacity-40">
              ‹
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => onPageChange(page + 1)}
              className="px-2 py-1 text-xs rounded hover:bg-accent disabled:opacity-40">
              ›
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <TooltipProvider>
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-[280px]">Song</TableHead>
                <TableHead className="w-[200px]">Artist</TableHead>
                <TableHead className="w-[80px] text-right">Plays</TableHead>
                <TableHead className="w-[120px]">Last Played</TableHead>
                <TableHead className="w-[160px]">Badges</TableHead>
                <TableHead className="w-[32px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tracks.map(track => {
                const histKey = makeHistoryKey(track.artist, track.name);
                const histEntry = history.get(histKey);
                const playCount = histEntry?.playCount ?? 0;
                const lastPlayed = histEntry?.lastPlayed ?? null;
                const barPct =
                  maxPlayCount > 0 ? (playCount / maxPlayCount) * 100 : 0;
                const tabResult = tabCache.get(track.artist, track.name);
                const isSelected = selectedTrackId === track.spotifyTrackId;

                return (
                  <TableRow
                    key={track.spotifyTrackId}
                    className={cn('cursor-pointer group', isSelected && 'bg-accent/60')}
                    onClick={() => onTrackClick(track)}>
                    <TableCell className="py-1.5 font-medium truncate max-w-[280px]">
                      {track.name}
                    </TableCell>
                    <TableCell className="py-1.5 text-muted-foreground truncate max-w-[200px]">
                      {track.artist}
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {playCount > 0 && (
                          <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden flex-shrink-0">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{width: `${barPct}%`}}
                            />
                          </div>
                        )}
                        <span className="text-xs tabular-nums text-muted-foreground w-6 text-right">
                          {playCount > 0 ? playCount : ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs text-muted-foreground">
                      {formatDate(lastPlayed)}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                'inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium',
                                track.hasChartMatch
                                  ? 'bg-green-500/15 text-green-500'
                                  : 'bg-muted text-muted-foreground',
                              )}>
                              ● Charts
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {track.hasChartMatch
                              ? 'Has matching Encore charts'
                              : 'No matching charts'}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                'inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium',
                                tabResult.state === 'idle'
                                  ? 'bg-muted text-muted-foreground/60'
                                  : tabResult.state === 'loading'
                                    ? 'bg-muted text-muted-foreground animate-pulse'
                                    : tabResult.tabs.length > 0
                                      ? 'bg-blue-500/15 text-blue-500'
                                      : 'bg-muted text-muted-foreground',
                              )}>
                              ◎{' '}
                              {tabResult.state === 'idle'
                                ? '?'
                                : tabResult.state === 'loading'
                                  ? '…'
                                  : `${tabResult.tabs.length}`}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {tabResult.state === 'idle'
                              ? 'Open track to search tabs'
                              : tabResult.state === 'loading'
                                ? 'Searching tabs...'
                                : tabResult.tabs.length > 0
                                  ? `${tabResult.tabs.length} tab(s) found`
                                  : 'No tabs found'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                    <TableCell
                      className="py-1.5 w-8"
                      onClick={e => e.stopPropagation()}>
                      <TrackMenu track={track} />
                    </TableCell>
                  </TableRow>
                );
              })}

              {tracks.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-muted-foreground text-sm">
                    No tracks found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
    </div>
  );
}

function TrackMenu({track}: {track: LibraryTrack}) {
  const [lists, setLists] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  async function loadLists() {
    const [existing, alreadySaved] = await Promise.all([
      getExplorerLists(),
      isTrackSaved(track.artist, track.name, 'Watch Later'),
    ]);
    setLists(existing.filter(l => l !== 'Watch Later'));
    setSaved(alreadySaved);
  }

  async function addToList(listName: string) {
    try {
      await saveToExplorerList(listName, {
        artist: track.artist,
        name: track.name,
      });
      toast.success(`Added to "${listName}"`);
      if (listName === 'Watch Later') setSaved(true);
    } catch {
      toast.error('Failed to save track');
    }
  }

  return (
    <DropdownMenu onOpenChange={open => open && loadLists()}>
      <DropdownMenuTrigger asChild>
        <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent text-muted-foreground transition-opacity">
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground truncate">
          {track.name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => addToList('Watch Later')}
          disabled={saved}>
          <BookOpen className="h-3.5 w-3.5" />
          {saved ? 'Saved for Later' : 'Save for Later'}
        </DropdownMenuItem>
        {lists.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Plus className="h-3.5 w-3.5" />
              Add to List
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48 max-h-64 overflow-y-auto">
              {lists.map(name => (
                <DropdownMenuItem key={name} onSelect={() => addToList(name)}>
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

