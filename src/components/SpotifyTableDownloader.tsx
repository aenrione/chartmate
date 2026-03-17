import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {ChartResponseEncore} from '@/lib/chartSelection';
import {
  FilterFn,
  Row,
  RowData,
  SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {useVirtual} from 'react-virtual';
import {removeStyleTags} from '@/lib/ui-utils';
import {downloadSong} from '@/lib/local-songs-folder';
import {useTrackUrls} from '@/lib/spotify-sdk/SpotifyFetching';
import {TableDownloadStates} from './SongsTable';
import {Button} from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AllowedInstrument,
  ChartInstruments,
  InstrumentImage,
  RENDERED_INSTRUMENTS,
  preFilterInstruments,
} from '@/components/ChartInstruments';
import {NotesData} from '@eliwhite/scan-chart';
import {SpotifyAlbums, SpotifyPlaylists} from '@/lib/local-db/types';
import {ChevronDown, ChevronRight, ChevronUp, Disc3, ExternalLink, Search as SearchIcon, User} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {cn} from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    setDownloadState(index: string, state: TableDownloadStates): void;
  }
}

export type SpotifyChartData = {
  isInstalled: boolean;
} & Omit<ChartResponseEncore, 'notesData'> & {notesData?: NotesData};

export type PickedSpotifyPlaylists = Pick<
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

export type PickedSpotifyAlbums = Pick<
  SpotifyAlbums,
  'id' | 'name' | 'artist_name' | 'total_tracks' | 'updated_at'
>;

export type SpotifyPlaysRecommendations = {
  spotifyTrackId?: string;
  artist: string;
  song: string;
  playCount?: number;
  spotifyUrl?: string | null;
  previewUrl?: string | null;
  matchingCharts: SpotifyChartData[];
  albumMemberships?: PickedSpotifyAlbums[];
  playlistMemberships?: PickedSpotifyPlaylists[];
  isAnyInstalled?: boolean;
};

type SongRow = {
  id: number;
  artist: string;
  song: string;
  playCount?: number;
  spotifyUrl?: string | null;
  previewUrl?: string | null;
  modifiedTime: Date;
  subRows: ChartRow[];
  source?: {
    albums: PickedSpotifyAlbums[];
    playlists: PickedSpotifyPlaylists[];
  };
};

type ChartRow = {
  id: number;
  artist: string;
  song: string;
  charter: string;
  instruments: {[instrument: string]: number};
  modifiedTime: Date;
  isInstalled: boolean;
  download: {
    artist: string;
    song: string;
    charter: string;
    file: string;
    md5: string;
    state: TableDownloadStates;
  };
};

type RowType = Partial<SongRow> & Partial<ChartRow>;

type GroupByField = 'none' | 'artist' | 'album' | 'playlist' | 'charter';

type VirtualItemType =
  | {type: 'group-header'; key: string; label: string; count: number}
  | {type: 'data-row'; row: Row<RowType>};

const ALWAYS_TRUE = () => true;

const DEFAULT_SORTING = [
  {id: 'playCount', desc: true},
  {id: 'artist', desc: false},
  {id: 'song', desc: false},
];

const instrumentFilter: FilterFn<RowType> = (
  row,
  columnId,
  value: AllowedInstrument[],
  addMeta: any,
) => {
  if (row.subRows.length > 0) {
    const subRowsIncluded = row.subRows.some(subRow => {
      return instrumentFilter(subRow, columnId, value, addMeta);
    });

    return subRowsIncluded;
  }

  const songInstruments = Object.keys(row.getValue(columnId));
  const allInstrumentsIncluded = value.every(instrument =>
    songInstruments.includes(instrument),
  );

  return allInstrumentsIncluded;
};

const globalSearchFilter: FilterFn<RowType> = (
  row,
  _columnId,
  value: string,
) => {
  if (!value) return true;
  const search = value.toLowerCase();

  const artist = row.original.artist?.toLowerCase() ?? '';
  const song = row.original.song?.toLowerCase() ?? '';
  const charter = row.original.charter?.toLowerCase() ?? '';

  if (artist.includes(search) || song.includes(search) || charter.includes(search)) {
    return true;
  }

  const source = row.original.source;
  if (source) {
    const albumMatch = source.albums?.some(a => a.name.toLowerCase().includes(search));
    const playlistMatch = source.playlists?.some(p => p.name.toLowerCase().includes(search));
    if (albumMatch || playlistMatch) return true;
  }

  return false;
};

const downloadedFilter: FilterFn<RowType> = (
  row,
  _columnId,
  enabled: boolean,
  _addMeta: any,
) => {
  if (!enabled) {
    return true;
  }

  if (row.subRows.some(subRow => subRow.original.isInstalled)) {
    return false;
  }
  return true;
};

function getGroupKeys(row: Row<RowType>, groupBy: GroupByField): string[] {
  switch (groupBy) {
    case 'artist':
      return [row.original.artist ?? 'Unknown'];
    case 'album': {
      const albums = row.original.source?.albums;
      if (!albums || albums.length === 0) return ['No Album'];
      return albums.map(a => a.name);
    }
    case 'playlist': {
      const playlists = row.original.source?.playlists;
      if (!playlists || playlists.length === 0) return ['No Playlist'];
      return playlists.map(p => p.name);
    }
    case 'charter': {
      const subRows = row.original.subRows;
      if (!subRows || subRows.length === 0) return ['Unknown'];
      const latest = subRows.reduce((best, sub) =>
        sub.modifiedTime > best.modifiedTime ? sub : best
      );
      return [latest.charter ?? 'Unknown'];
    }
    default:
      return ['Unknown'];
  }
}

const columnHelper = createColumnHelper<RowType>();

const columns = [
  columnHelper.accessor('artist', {
    header: 'Artist',
    minSize: 250,
    enableMultiSort: true,
    sortingFn: 'alphanumeric',
    cell: props => {
      const icon = props.row.getIsExpanded() ? (
        <ChevronDown className="inline h-3.5 w-3.5" />
      ) : (
        <ChevronRight
          className={`inline h-3.5 w-3.5 ${
            props.row.getParentRow() != null ? 'opacity-0 pr-10' : 'opacity-0'
          }`}
        />
      );

      return (
        <>
          {icon} {props.getValue()}
        </>
      );
    },
  }),
  columnHelper.accessor('song', {
    header: 'Song',
    minSize: 250,
    enableMultiSort: true,
    sortingFn: 'alphanumeric',
    cell: props => {
      return props.getValue();
    },
  }),
  columnHelper.accessor('playCount', {
    header: () => <span className="whitespace-nowrap"># Plays</span>,
    enableMultiSort: true,
    cell: props => {
      return props.getValue();
    },
  }),
  columnHelper.accessor('source', {
    header: 'Source',
    maxSize: 150,
    enableSorting: false,

    cell: props => {
      if (!props.row.getIsExpanded()) {
        return null;
      }

      const value = props.getValue();
      if (value == null || (value.albums == null && value.playlists == null)) {
        return null;
      }

      return <SourceRenderer source={value} />;
    },
  }),
  columnHelper.accessor('charter', {
    header: 'Charter',
    minSize: 150,
    enableMultiSort: true,
    sortingFn: 'alphanumeric',
    cell: props => {
      if (props.row.getIsExpanded()) {
        return null;
      }

      const value = props.getValue();

      if (value == null) {
        return null;
      }

      return removeStyleTags(value || '');
    },
  }),
  columnHelper.accessor('instruments', {
    header: 'Instruments',
    minSize: 300,
    enableSorting: false,
    cell: props => {
      if (props.row.getIsExpanded()) {
        return null;
      }

      const value = props.getValue();

      if (value == null) {
        return null;
      }

      return <ChartInstruments instruments={value} size="md" />;
    },
    filterFn: instrumentFilter,
  }),
  columnHelper.accessor('modifiedTime', {
    header: 'Last Updated',
    minSize: 100,
    enableSorting: true,
    cell: props => {
      if (props.row.getIsExpanded()) {
        return null;
      }

      const value = props.getValue();
      if (value == null) {
        return null;
      }

      return value.toLocaleDateString();
    },
  }),
  columnHelper.accessor('download', {
    header: 'Download',
    minSize: 100,
    enableSorting: false,
    cell: props => {
      if (props.row.getIsExpanded()) {
        return null;
      }

      if (props.row.original.isInstalled) {
        return <span>Downloaded</span>;
      }

      const value = props.getValue();

      if (value == null) {
        return null;
      }

      const {artist, song, charter, file, state} = value;
      const updateDownloadState = props.table.options.meta?.setDownloadState;
      function update(state: TableDownloadStates) {
        if (updateDownloadState != null) {
          const key = props.row.original.download?.md5;
          if (key != null) {
            updateDownloadState(key, state);
          }
        }
      }
      return (
        <DownloadButton
          artist={artist}
          song={song}
          charter={charter}
          url={file}
          state={state}
          updateDownloadState={update}
        />
      );
    },
    filterFn: downloadedFilter,
  }),
  columnHelper.accessor('previewUrl', {
    header: 'Preview',
    minSize: 100,
    enableSorting: false,
    cell: props => {
      if (!props.row.getIsExpanded()) {
        return null;
      }

      const url = props.getValue();
      const spotifyUrl = props.row.original.spotifyUrl;

      const {artist, song} = props.row.original;

      if (artist == null || song == null) {
        return null;
      }

      if (url == null || spotifyUrl == null) {
        return <LookUpPreviewButton artist={artist} song={song} />;
      }

      return (
        <SpotifyLinkButton spotifyUrl={spotifyUrl} />
      );
    },
  }),
];

function LookUpPreviewButton({artist, song}: {artist: string; song: string}) {
  const getTrackUrls = useTrackUrls(artist, song);
  const [urls, setUrls] =
    useState<Awaited<ReturnType<typeof getTrackUrls>>>(null);
  const [fetched, setFetched] = useState(false);

  const handler = useCallback(async () => {
    const result = await getTrackUrls();
    setUrls(result);
    setFetched(true);
  }, [getTrackUrls]);

  return (
    <>
      {urls?.spotifyUrl == null ? (
        fetched == true ? (
          <div className="flex gap-4 items-center">
            No Preview
          </div>
        ) : (
          <Button onClick={handler} size="sm" variant="outline">
            Look up
          </Button>
        )
      ) : (
        <SpotifyLinkButton spotifyUrl={urls.spotifyUrl} />
      )}
    </>
  );
}

function SpotifyLinkButton({spotifyUrl}: {spotifyUrl: string}) {
  return (
    <a href={spotifyUrl} target="_blank" rel="noopener noreferrer">
      <Button variant="outline" size="sm">
        <ExternalLink className="inline h-3.5 w-3.5" />
        Spotify
      </Button>
    </a>
  );
}

export default function SpotifyTableDownloader({
  tracks,
  showPreview,
  showPlayCount,
}: {
  tracks: SpotifyPlaysRecommendations[];
  showPreview: boolean;
  showPlayCount?: boolean;
}) {
  const hasPlayCount = showPlayCount ?? tracks[0].playCount != null;

  const [downloadState, setDownloadState] = useState<{
    [key: string]: TableDownloadStates;
  }>({});

  const trackState = useMemo(
    () =>
      tracks.map(
        (track, index): SongRow => ({
          id: index,
          artist: track.artist,
          song: track.song,
          ...(hasPlayCount ? {playCount: track.playCount} : {}),
          spotifyUrl: track.spotifyUrl,
          previewUrl: track.previewUrl,
          modifiedTime: track.matchingCharts.reduce((maxDate, chart) => {
            const chartDate = new Date(chart.modifiedTime);
            if (chartDate > maxDate) {
              return chartDate;
            }
            return maxDate;
          }, new Date(track.matchingCharts[0].modifiedTime)),
          ...(track.albumMemberships != null &&
          track.playlistMemberships != null
            ? {
                source: {
                  albums: track.albumMemberships,
                  playlists: track.playlistMemberships,
                },
              }
            : {}),
          subRows: track.matchingCharts.map((chart, subIndex) => ({
            id: subIndex,
            artist: chart.artist,
            song: chart.name,
            charter: chart.charter,
            instruments: preFilterInstruments(chart),
            modifiedTime: new Date(chart.modifiedTime),
            isInstalled: chart.isInstalled,
            download: {
              artist: chart.artist,
              song: chart.name,
              charter: chart.charter,
              file: chart.file,
              md5: chart.md5,
              state: downloadState[chart.md5] ?? 'not-downloading',
            },
          })),
        }),
      ),
    [tracks, hasPlayCount, downloadState],
  );

  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);

  const [instrumentFilters, setInstrumentFilters] = useState<
    AllowedInstrument[]
  >([]);

  const [hideDownloadedFilter, setHideDownloadedFilter] = useState(false);

  const [groupBy, setGroupBy] = useState<GroupByField>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleGroupByChange = useCallback((value: string) => {
    setGroupBy(value as GroupByField);
    setCollapsedGroups(new Set());
  }, []);


  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const columnFilters = useMemo(
    () => [
      {
        id: 'instruments',
        value: instrumentFilters,
      },
      {
        id: 'download',
        value: hideDownloadedFilter,
      },
    ],
    [instrumentFilters, hideDownloadedFilter],
  );

  const table = useReactTable({
    data: trackState,
    columns,
    state: {
      sorting,
      columnVisibility: {
        playCount: hasPlayCount,
        previewUrl: showPreview,
      },
      columnFilters,
      globalFilter: debouncedSearch,
      expanded: true,
    },
    initialState: {
      sorting: DEFAULT_SORTING,
    },
    globalFilterFn: globalSearchFilter,
    enableGlobalFilter: true,
    meta: {
      setDownloadState(index: string, state: TableDownloadStates) {
        setDownloadState(prev => {
          return {...prev, [index]: state};
        });
      },
    },
    enableExpanding: true,
    enableMultiSort: true,
    isMultiSortEvent: ALWAYS_TRUE,
    getIsRowExpanded: (row: Row<RowType>) => row.original.subRows != null,
    onSortingChange: setSorting,
    getSubRows: row => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: false,
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const {rows} = table.getRowModel();

  const groupedItems: VirtualItemType[] = useMemo(() => {
    if (groupBy === 'none') {
      return rows.map(row => ({type: 'data-row' as const, row}));
    }

    const groups = new Map<string, Row<RowType>[]>();
    const groupOrder: string[] = [];

    for (const row of rows) {
      if (row.getParentRow() != null) continue;

      const keys = getGroupKeys(row, groupBy);
      for (const key of keys) {
        if (!groups.has(key)) {
          groups.set(key, []);
          groupOrder.push(key);
        }
        groups.get(key)!.push(row);
      }
    }

    const items: VirtualItemType[] = [];
    for (const key of groupOrder) {
      const groupRows = groups.get(key)!;
      items.push({
        type: 'group-header',
        key,
        label: key,
        count: groupRows.length,
      });
      if (!collapsedGroups.has(key)) {
        for (const parentRow of groupRows) {
          items.push({type: 'data-row', row: parentRow});
          for (const subRow of parentRow.subRows) {
            items.push({type: 'data-row', row: subRow as Row<RowType>});
          }
        }
      }
    }

    return items;
  }, [rows, groupBy, collapsedGroups]);

  const allGroupKeys = useMemo(
    () => groupedItems.filter(i => i.type === 'group-header').map(i => (i as {type: 'group-header'; key: string}).key),
    [groupedItems],
  );

  const allCollapsed = groupBy !== 'none' && allGroupKeys.length > 0 && collapsedGroups.size === allGroupKeys.length;

  const toggleAllGroups = useCallback(() => {
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(allGroupKeys));
    }
  }, [allCollapsed, allGroupKeys]);

  const rowVirtualizer = useVirtual({
    parentRef: tableContainerRef,
    size: groupedItems.length,
    overscan: 10,
  });

  const vRows = rowVirtualizer.virtualItems;
  const paddingTop = vRows.length > 0 ? vRows[0]?.start || 0 : 0;
  const paddingBottom =
    vRows.length > 0
      ? rowVirtualizer.totalSize - (vRows[vRows.length - 1]?.end || 0)
      : 0;

  const filtersChangedCallback = useCallback((filters: AllowedInstrument[]) => {
    setInstrumentFilters(filters);
  }, []);

  const downloadedFilterChangedCallback = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setHideDownloadedFilter(e.target.checked);
    },
    [],
  );

  const numMatchingCharts = useMemo(
    () =>
      rows
        .map(
          row =>
            row.original.subRows?.filter(chart => !chart.isInstalled).length ||
            0,
        )
        .reduce((acc, num) => acc + num, 0),
    [rows],
  );

  return (
    <>
      <div className="rounded-lg bg-card ring-1 ring-slate-900/5 px-4 py-2 mb-2 space-y-2">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-[320px]">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search artist, song, album..."
              className="h-8 pl-8 text-sm"
            />
          </div>

          <div className="w-px h-6 bg-border" />

          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Group</span>
            <Select value={groupBy} onValueChange={handleGroupByChange}>
              <SelectTrigger className="h-8 w-[120px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="artist">Artist</SelectItem>
                <SelectItem value="album">Album</SelectItem>
                <SelectItem value="playlist">Playlist</SelectItem>
                <SelectItem value="charter">Charter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {groupBy !== 'none' && (
            <>
              <div className="w-px h-6 bg-border" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={toggleAllGroups}
              >
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </Button>
            </>
          )}

          <div className="flex-1" />

          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {instrumentFilters.length !== RENDERED_INSTRUMENTS.length &&
              `${numMatchingCharts} charts for `}
            {tracks.length} songs
          </span>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-2 justify-end">
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Instruments</span>
            <Filters filtersChanged={filtersChangedCallback} />
          </div>

          <div className="w-px h-6 bg-border" />

          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
            <input
              onChange={downloadedFilterChangedCallback}
              type="checkbox"
              className="rounded border-border"
            />
            Hide downloaded
          </label>
        </div>
      </div>
      <div
        className="bg-card text-card-foreground rounded-lg ring-1 ring-slate-900/5 shadow-xl overflow-y-auto ph-8"
        ref={tableContainerRef}>
        <TooltipProvider>
          <Table>
            <TableHeader className="sticky top-0">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => {
                    return (
                      <TableHead
                        key={header.id}
                        colSpan={header.colSpan}
                        className={`bg-card py-0 ${
                          header.column.getCanSort()
                            ? 'cursor-pointer select-none'
                            : ''
                        }`}
                        style={{
                          textAlign: (header.column.columnDef.meta as any)
                            ?.align,
                          width: header.getSize(),
                        }}
                        onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {{
                          asc: <ChevronUp className="inline h-3.5 w-3.5 ml-1" />,
                          desc: <ChevronDown className="inline h-3.5 w-3.5 ml-1" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && (
                <TableRow>
                  <TableCell style={{height: `${paddingTop}px`}}></TableCell>
                </TableRow>
              )}
              {vRows.map(virtualRow => {
                const item = groupedItems[virtualRow.index];

                if (item.type === 'group-header') {
                  return (
                    <TableRow
                      key={`group-${item.key}`}
                      className="bg-secondary/50 cursor-pointer hover:bg-secondary/70"
                      onClick={() => toggleGroupCollapse(item.key)}
                    >
                      <TableCell colSpan={columns.length} className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          {collapsedGroups.has(item.key) ? (
                            <ChevronRight className="h-4 w-4 text-primary" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-primary" />
                          )}
                          <span className="font-semibold text-sm">{item.label}</span>
                          <span className="text-xs text-muted-foreground">{item.count} songs</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                const row = item.row;
                return (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map(cell => {
                      return (
                        <TableCell
                          className={cn(
                            'py-1',
                            row.getIsExpanded() && 'bg-secondary',
                            groupBy !== 'none' && row.getParentRow() == null && 'pl-8',
                          )}
                          key={cell.id}
                          style={{
                            textAlign: (cell.column.columnDef.meta as any)
                              ?.align,
                          }}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
              {rows.length === 0 && debouncedSearch && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                    No results for &ldquo;{debouncedSearch}&rdquo;
                  </TableCell>
                </TableRow>
              )}
              {paddingBottom > 0 && (
                <TableRow>
                  <TableCell style={{height: `${paddingBottom}px`}} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
    </>
  );
}

const Filters = memo(function Filters({
  filtersChanged,
}: {
  filtersChanged: (instrument: AllowedInstrument[]) => void;
}) {
  const [selectedFilters, setSelectedFilters] = useState<AllowedInstrument[]>(
    [],
  );

  useEffect(() => {
    filtersChanged(selectedFilters);
  }, [filtersChanged, selectedFilters]);

  const callback = useCallback((instrument: AllowedInstrument) => {
    setSelectedFilters(prev => {
      if (prev.includes(instrument)) {
        return prev.filter(i => i != instrument);
      } else {
        const newFilter = [...prev, instrument];
        return newFilter;
      }
    });
  }, []);

  return (
    <>
      {RENDERED_INSTRUMENTS.map((instrument: AllowedInstrument) => {
        return (
          <InstrumentImage
            size="md"
            instrument={instrument}
            key={instrument}
            classNames={cn(
              'cursor-pointer',
              selectedFilters.length === 0 ||
                selectedFilters.includes(instrument)
                ? 'opacity-100'
                : 'opacity-50',
            )}
            onClick={callback}
          />
        );
      })}
    </>
  );
});

function DownloadButton({
  artist,
  song,
  charter,
  url,
  state,
  updateDownloadState,
}: {
  artist: string;
  song: string;
  charter: string;
  url: string;
  state: TableDownloadStates;
  updateDownloadState: (state: TableDownloadStates) => void;
}) {
  const handler = useCallback(async () => {
    if (state != 'not-downloading') {
      return;
    }

    try {
      updateDownloadState('downloading');
      await downloadSong(artist, song, charter, url, {asSng: true});
    } catch (err) {
      console.log('Error while downloading', artist, song, charter, url, err);
      updateDownloadState('failed');
      return;
    }

    updateDownloadState('downloaded');
  }, [state, updateDownloadState, artist, song, charter, url]);

  switch (state) {
    case 'downloaded':
      return <span>Downloaded</span>;
    case 'downloading':
      return <span>Downloading...</span>;
    case 'failed':
      return <span>Failed</span>;
    case 'not-downloading':
      return <Button onClick={handler}>Download</Button>;
  }
}

function SourceRenderer({source}: {source: NonNullable<SongRow['source']>}) {
  let albums = null;
  let playlists = null;
  if (source.playlists.length > 0) {
    playlists = source.playlists.map(playlist => (
      <div key={playlist.id} className="flex items-center gap-2 flex-1 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-xs truncate" title={playlist.name}>
              {playlist.name}
            </p>
          </TooltipTrigger>
          <TooltipContent side="top">{playlist.name}</TooltipContent>
        </Tooltip>
        <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
          <User className="h-3 w-3" />
          {playlist.owner_display_name}
        </span>
      </div>
    ));
  }
  if (source.albums.length > 0) {
    albums = source.albums.map(album => (
      <div key={album.id} className="flex items-center gap-2 flex-1 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-xs truncate" title={album.name}>
              {album.name}
            </p>
          </TooltipTrigger>
          <TooltipContent side="top">{album.name}</TooltipContent>
        </Tooltip>
        <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
          <Disc3 className="h-3 w-3" />
          {album.artist_name}
        </span>
      </div>
    ));
  }
  return (
    <div className="max-w-[175px] overflow-x-hidden">
      {playlists}
      {albums}
    </div>
  );
}
