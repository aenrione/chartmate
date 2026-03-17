import {useCallback, useEffect, useReducer, useState} from 'react';
import SongsTable from './SongsTable';

import {SongAccumulator} from '@/lib/local-songs-folder/scanLocalCharts';
import {
  useChorusChartDb,
  findMatchingCharts,
  findMatchingChartsExact,
} from '@/lib/chorusChartDb';
import {scanForInstalledCharts} from '@/lib/local-songs-folder';
import {getSongsFolderPath, clearSongsFolderPath, changeSongsFolder} from '@/lib/songs-folder';
import {Button} from '@/components/ui/button';
import Loading from '@/components/ui/loading';
import {
  ChartInfo,
  ChartResponseEncore,
  RankingGroups,
  selectChart,
} from '@/lib/chartSelection';
import {Searcher} from 'fast-fuzzy';

export type RecommendedChart =
  | {
      type: 'best-chart-installed';
    }
  | {
      type: 'better-chart-found';
      betterChart: ChartResponseEncore;
      reasons: string[];
    };

export type SongWithRecommendation = SongAccumulator & {
  recommendedChart: RecommendedChart;
};

type SongState = {
  songs: SongWithRecommendation[] | null;
  songsCounted: number;
  chorusCharts: ChartResponseEncore[] | null;
};

type SongStateActions =
  | {
      type: 'reset';
    }
  | {
      type: 'increment-counter';
    }
  | {
      type: 'set-songs';
      songs: SongWithRecommendation[];
    };

function songsReducer(state: SongState, action: SongStateActions): SongState {
  switch (action.type) {
    case 'reset':
      return {
        songs: null,
        songsCounted: 0,
        chorusCharts: state.chorusCharts,
      };
    case 'increment-counter':
      return {...state, songsCounted: state.songsCounted + 1};
    case 'set-songs':
      return {...state, songs: action.songs};
    default:
      throw new Error('unrecognized action');
  }
}

export default function CompareChartsToLocal({
  rankingGroups,
  exact,
}: {
  rankingGroups: RankingGroups;
  exact: boolean;
}) {
  const [songsState, songsDispatch] = useReducer(songsReducer, {
    songs: null,
    songsCounted: 0,
    chorusCharts: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [hasFolder, setHasFolder] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);

  const [, fetchChorusCharts] = useChorusChartDb();

  const scan = useCallback(async () => {
    songsDispatch({type: 'reset'});
    setError(null);
    setScanning(true);

    const abortController = new AbortController();
    const chorusChartsPromise = fetchChorusCharts(abortController);

    let songs: SongAccumulator[] = [];

    try {
      const scanResult = await scanForInstalledCharts(() => {
        songsDispatch({type: 'increment-counter'});
      });
      songs = scanResult.installedCharts;
      setHasFolder(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('forbidden path')) {
        await clearSongsFolderPath();
        setHasFolder(false);
        setError(
          'The previously selected folder is no longer accessible. Please select your Songs folder again.',
        );
      } else {
        console.log('User canceled picker', e);
      }
      setScanning(false);
      return;
    }

    const chorusCharts = await chorusChartsPromise;

    const searcher = new Searcher(chorusCharts, {
      keySelector: chart => chart.artist,
      threshold: 1,
      useDamerau: false,
      useSellers: false,
    });

    const songsWithRecommendation: SongWithRecommendation[] = songs.map(
      song => {
        let recommendation: RecommendedChart;

        const matchingCharts = exact
          ? findMatchingChartsExact(song.artist, song.song, chorusCharts)
          : findMatchingCharts(song.artist, song.song, searcher);

        if (matchingCharts.length == 0) {
          recommendation = {
            type: 'best-chart-installed',
          };
        } else {
          const currentSong = {
            ...song.data,
            get file() {
              return song.file;
            },
            modifiedTime: song.modifiedTime,
          };

          const possibleCharts: (typeof currentSong | ChartInfo)[] = [
            currentSong,
          ].concat(matchingCharts);

          const {chart: recommendedChart, reasons} = selectChart(
            possibleCharts,
            rankingGroups,
          );

          if (recommendedChart == currentSong) {
            recommendation = {
              type: 'best-chart-installed',
            };
          } else if (Array.isArray(reasons)) {
            recommendation = {
              type: 'better-chart-found',
              betterChart: recommendedChart as unknown as ChartResponseEncore,
              reasons: reasons,
            };
          } else {
            throw new Error('Unexpected chart comparison');
          }
        }

        return {
          ...song,
          recommendedChart: recommendation,
        };
      },
    );

    songsDispatch({
      type: 'set-songs',
      songs: songsWithRecommendation,
    });
    setScanning(false);
  }, [exact, rankingGroups]);

  const handleChangeFolder = useCallback(async () => {
    try {
      await changeSongsFolder();
    } catch {
      // User canceled the picker
      return;
    }
    scan();
  }, [scan]);

  // Auto-scan on mount if a folder is already saved
  useEffect(() => {
    getSongsFolderPath().then(path => {
      if (path) {
        setHasFolder(true);
        scan();
      } else {
        setHasFolder(false);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Loading state while checking for saved folder
  if (hasFolder === null) {
    return <Loading message="Checking songs folder..." />;
  }

  if (songsState.songs) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button onClick={scan}>Rescan</Button>
          <Button variant="outline" onClick={handleChangeFolder}>
            Change Folder
          </Button>
        </div>
        <SongsTable songs={songsState.songs} />
      </div>
    );
  }

  // Show scanning progress
  if (scanning) {
    return <Loading message={`${songsState.songsCounted} songs scanned...`} />;
  }

  // Empty state: no folder selected yet
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-semibold">Check for Chart Updates</h2>
        <p className="text-sm text-muted-foreground">
          Scans your installed charts and finds newer versions from the same
          charter. This tool is currently in beta &mdash; back up your Songs
          folder before using it.
        </p>
      </div>
      {error && (
        <p className="text-sm text-destructive max-w-md">{error}</p>
      )}
      <Button onClick={scan}>
        Select Clone Hero Songs Folder
      </Button>
    </div>
  );
}
