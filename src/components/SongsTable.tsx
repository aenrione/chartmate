import {
  useCallback,
  useRef,
  useState,
  useMemo,
} from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  Row,
  RowData,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {useVirtual} from 'react-virtual';

import {AiOutlineCheck} from 'react-icons/ai';
import CompareView from './CompareView';
import {
  calculateTimeRemaining,
  formatTimeRemaining,
  removeStyleTags,
} from '@/lib/ui-utils';
import pMap from 'p-map';
import {downloadSong} from '@/lib/local-songs-folder';
import {SongWithRecommendation} from './CompareChartsToLocal';
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
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

export type TableDownloadStates =
  | 'downloaded'
  | 'downloading'
  | 'not-downloading'
  | 'failed';

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData> {
    setDownloadState(index: string, state: TableDownloadStates): void;
  }
}

type RowType = {
  id: number;
  modifiedTime: Date;
  downloadState: TableDownloadStates;
  recommendationReasons: string[] | null;
} & Omit<Omit<SongWithRecommendation, 'modifiedTime'>, 'file'>;

const columnHelper = createColumnHelper<RowType>();

export default function SongsTable({songs}: {songs: SongWithRecommendation[]}) {
  const [currentlyReviewing, setCurrentlyReviewing] = useState<RowType | null>(
    null,
  );

  const columns = useMemo(
    () => [
      {
        accessorKey: 'artist',
        header: 'Artist',
        minSize: 250,
      },
      {
        accessorKey: 'song',
        header: 'Song',
        minSize: 250,
      },
      columnHelper.accessor('charter', {
        header: 'Charter',
        minSize: 200,
        cell: props => {
          return removeStyleTags(props.getValue() || '');
        },
      }),
      columnHelper.accessor('recommendationReasons', {
        header: 'Reasons to Update',
        minSize: 300,
        cell: props => {
          const value = props.getValue();
          if (value != null) {
            return (
              <ul>
                {value.map(reason => {
                  return <li key={reason}>{reason}</li>;
                })}
              </ul>
            );
          }
        },
      }),
      columnHelper.accessor('recommendedChart', {
        header: 'Updated Chart?',
        meta: {
          align: 'center',
        },
        size: 100,
        cell: props => {
          if (props.row.original.downloadState == 'downloaded') {
            return <span>Downloaded</span>;
          }

          const value = props.getValue();
          switch (value.type) {
            case 'best-chart-installed':
              return <AiOutlineCheck />;
            case 'better-chart-found':
              return (
                <>
                  <Button
                    onClick={() => {
                      setCurrentlyReviewing(props.row.original);
                    }}>
                    Review
                  </Button>
                </>
              );
            default:
              throw new Error('Unexpected recommended type');
          }
        },
        sortingFn: (rowA, rowB, columnId): number => {
          const ordering = [
            'better-chart-found',
            'searching',
            'best-chart-installed',
            'not-checked',
          ];

          const aType = (rowA.getValue(columnId) as RowType['recommendedChart'])
            .type;
          const btype = (rowB.getValue(columnId) as RowType['recommendedChart'])
            .type;

          const aIndex = ordering.indexOf(aType);
          const bIndex = ordering.indexOf(btype);

          if (aIndex == -1 || bIndex == -1) {
            throw new Error('Unexpected recommendation ordering');
          }

          return bIndex - aIndex;
        },
      }),
    ],
    [],
  );

  const [downloadState, setDownloadState] = useState<{
    [key: string]: TableDownloadStates;
  }>({});

  const songsWithUpdates = useMemo(() => {
    return songs.filter(
      song => song.recommendedChart.type == 'better-chart-found',
    );
  }, [songs]);

  const songState = useMemo(
    () =>
      songsWithUpdates.map((song, index) => ({
        id: index,
        artist: song.data.artist,
        song: song.data.name,
        charter: song.data.charter,
        modifiedTime: new Date(song.modifiedTime),
        recommendationReasons:
          song.recommendedChart.type == 'better-chart-found'
            ? song.recommendedChart.reasons
            : null,
        recommendedChart: song.recommendedChart,
        data: song.data,
        downloadState: downloadState[index],
        handleInfo: song.handleInfo,
      })),
    [songsWithUpdates, downloadState],
  );

  const updatesWithSameCharter = useMemo(() => {
    return songsWithUpdates.filter(
      song =>
        song.recommendedChart.type == 'better-chart-found' &&
        song.recommendedChart.reasons.includes(
          'Chart from same charter is newer',
        ),
    );
  }, [songsWithUpdates]);

  const updateDownloadState = useCallback(
    (index: string, state: TableDownloadStates) => {
      setDownloadState(prev => {
        return {...prev, [index]: state};
      });
    },
    [],
  );

  const [updateStatus, setUpdateState] = useState<
    'not-started' | 'started' | 'done'
  >('not-started');
  const [numUpdated, setNumUpdated] = useState(0);
  const [startedUpdate, setStartedUpdate] = useState<Date | null>(null);

  const updateChartsWithSameCharter = useCallback(async () => {
    setNumUpdated(0);
    setUpdateState('started');
    setStartedUpdate(new Date());

    await pMap(
      songState,
      async song => {
        if (
          !(
            song.recommendedChart.type == 'better-chart-found' &&
            song.recommendedChart.reasons.includes(
              'Chart from same charter is newer',
            )
          )
        ) {
          return;
        }

        const {artist, song: name, charter} = song;
        if (artist == null || name == null || charter == null) {
          throw new Error('Artist, name, or charter is null in song.ini');
        }

        const id = song.id.toString();

        updateDownloadState(id, 'downloading');

        try {
          await downloadSong(
            artist,
            name,
            charter,
            song.recommendedChart.betterChart.file,
            {
              folderPath: song.handleInfo.parentDir,
              replaceExisting: true,
              asSng: true,
            },
          );

          updateDownloadState(id, 'downloaded');
          setNumUpdated(n => n + 1);
        } catch (err) {
          console.log('Failed to download', artist, name, charter, err);
          updateDownloadState(id, 'failed');
        }
      },
      {concurrency: 3, stopOnError: false},
    );

    setUpdateState('done');
  }, [songState, updateDownloadState]);

  const [sorting, setSorting] = useState<SortingState>([
    {id: 'recommendedChart', desc: true},
    {id: 'artist', desc: false},
    {id: 'song', desc: false},
  ]);

  const table = useReactTable({
    data: songState,
    columns,
    state: {
      sorting,
    },
    enableMultiSort: true,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: false,
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const {rows} = table.getRowModel();
  const rowVirtualizer = useVirtual({
    parentRef: tableContainerRef,
    size: rows.length,
    overscan: 10,
  });
  const {virtualItems: virtualRows, totalSize} = rowVirtualizer;

  const paddingTop = virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows?.[virtualRows.length - 1]?.end || 0)
      : 0;

  const close = useCallback(() => {
    setCurrentlyReviewing(null);
  }, []);

  const updateTimeRemaining = useMemo(() => {
    if (startedUpdate == null) {
      return null;
    }

    return formatTimeRemaining(
      calculateTimeRemaining(
        startedUpdate,
        updatesWithSameCharter.length,
        numUpdated,
        1000,
      ),
    );
  }, [numUpdated, startedUpdate, updatesWithSameCharter.length]);

  return (
    <>
      {currentlyReviewing &&
        currentlyReviewing.recommendedChart.type == 'better-chart-found' && (
          <Dialog open={true} onOpenChange={open => { if (!open) close(); }}>
            <DialogContent className="max-w-3xl overflow-y-auto max-h-[90vh]">
              <CompareView
                id={currentlyReviewing.id}
                currentChart={currentlyReviewing.data}
                currentModified={currentlyReviewing.modifiedTime}
                recommendedChart={
                  currentlyReviewing.recommendedChart.betterChart
                }
                recommendedModified={
                  new Date(
                    currentlyReviewing.recommendedChart.betterChart.modifiedTime,
                  )
                }
                parentDirectoryPath={
                  currentlyReviewing.handleInfo.parentDir
                }
                currentChartFileName={
                  currentlyReviewing.handleInfo.fileName
                }
                recommendedChartUrl={
                  currentlyReviewing.recommendedChart.betterChart.file
                }
                updateDownloadState={updateDownloadState}
                close={close}
              />
            </DialogContent>
          </Dialog>
        )}

      <div className="space-y-4 sm:space-y-0 sm:space-x-4 w-full text-start sm:text-end">
        <div>
          {songsWithUpdates.length} updates for {songs.length} songs found
        </div>

        {updateStatus == 'started' ? (
          <>
            <span>
              Updating, {numUpdated} of {updatesWithSameCharter.length}
            </span>
            <div>
              <span>{updateTimeRemaining}</span>
            </div>
          </>
        ) : updateStatus == 'done' ? (
          <span>
            Updated {numUpdated} of {updatesWithSameCharter.length}
          </span>
        ) : (
          <Button
            onClick={updateChartsWithSameCharter}
            title="The recommended chart for these songs is a newer chart from the same charter you currently have installed. These updates likely don't need review.">
            Update {updatesWithSameCharter.length} songs from same charter
          </Button>
        )}
      </div>
      <div
        className="bg-card text-card-foreground rounded-lg ring-1 ring-slate-900/5 shadow-xl overflow-y-auto ph-8"
        ref={tableContainerRef}>
        <Table>
          <TableHeader className="sticky top-0">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className="bg-card py-4"
                      style={{
                        textAlign: (header.column.columnDef.meta as any)?.align,
                        width: header.getSize(),
                      }}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
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
            {virtualRows.map(virtualRow => {
              const row = rows[virtualRow.index] as Row<RowType>;
              return (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map(cell => {
                    return (
                      <TableCell
                        key={cell.id}
                        style={{
                          textAlign: (cell.column.columnDef.meta as any)?.align,
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
            {paddingBottom > 0 && (
              <TableRow>
                <TableCell style={{height: `${paddingBottom}px`}} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
