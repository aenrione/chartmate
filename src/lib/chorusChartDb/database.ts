import {useState, useCallback} from 'react';
import {ChartResponseEncore} from '../chartSelection';
import fetchNewCharts from './fetchNewCharts';
import {
  upsertCharts,
  createScanSession,
  updateScanProgress,
  completeScanSession,
} from '@/lib/local-db/chorus';
import {getLastScanSession} from '@/lib/local-db/chorus/scanning';
import {getLocalDb} from '@/lib/local-db/client';
import {search, Searcher} from 'fast-fuzzy';
import {ChartInfo} from '../chartSelection';

export type ChorusChartProgress = {
  status:
    | 'idle'
    | 'fetching'
    | 'updating-db'
    | 'complete'
    | 'error';
  numFetched: number;
  numTotal: number;
};

const DEBUG = import.meta.env.DEV;

function debugLog(message: string) {
  if (DEBUG) {
    console.log(message);
  }
}

export function useChorusChartDb(): [
  ChorusChartProgress,
  (abort: AbortController) => Promise<ChartResponseEncore[]>,
] {
  const [progress, setProgress] = useState<ChorusChartProgress>({
    status: 'idle',
    numFetched: 0,
    numTotal: 0,
  });

  const run = useCallback(
    async (_abort: AbortController): Promise<ChartResponseEncore[]> => {
      return new Promise(async (resolve, _reject) => {
        setProgress(progress => ({
          ...progress,
          status: 'fetching',
        }));

        setProgress(progress => ({
          ...progress,
          status: 'updating-db',
        }));
        debugLog('Fetching updated charts');

        await getUpdatedCharts((_, stats) => {
          setProgress(progress => ({
            ...progress,
            numFetched: stats.totalSongsFound,
            numTotal: stats.totalSongsToFetch,
          }));
        });
        debugLog('Done fetching charts');

        setProgress(progress => ({
          ...progress,
          status: 'complete',
        }));

        resolve([]);
      });
    },
    [],
  );

  return [progress, run];
}

async function getUpdatedCharts(
  onEachResponse: Parameters<typeof fetchNewCharts>[2],
) {
  // Determine the point-in-time to scan from
  const lastScanSession = await getLastScanSession();
  let scan_since_time = new Date(0);
  let last_chart_id = 1;

  if (lastScanSession?.status === 'completed') {
    scan_since_time = new Date(lastScanSession.completed_at ?? 0);
    last_chart_id = 1;
  } else if (lastScanSession?.status === 'in_progress') {
    scan_since_time = new Date(lastScanSession.started_at);
    last_chart_id = lastScanSession.last_chart_id ?? 1;
  }
  // else: lastScanSession == null → scan_since_time = new Date(0), last_chart_id = 1

  // Start a new scan session
  const db = await getLocalDb();
  await db.transaction().execute(async trx => {
    const id = await createScanSession(trx, scan_since_time, last_chart_id);

    let updatePromises = Promise.resolve();

    const {charts: _charts, metadata: _metadata} = await fetchNewCharts(
      scan_since_time,
      last_chart_id,
      (json, stats) => {
        // Store charts and update scan progress
        updatePromises = updatePromises.then(async () => {
          await upsertCharts(trx, json as unknown as ChartResponseEncore[]);
          last_chart_id = stats.lastChartId;
          await updateScanProgress(trx, id, stats.lastChartId);
        });

        onEachResponse(json, stats);
      },
    );

    await updatePromises;

    // Mark the scan session as completed
    await completeScanSession(trx, id);
  });
}

export function findMatchingChartsExact(
  artist: string,
  song: string,
  charts: ChartResponseEncore[],
) {
  return charts.filter(chart => {
    return chart.artist == artist && chart.name == song;
  });
}

export function findMatchingCharts<T extends ChartInfo>(
  artist: string,
  song: string,
  artistSearcher: Searcher<
    T,
    {
      keySelector: (chart: T) => string[];
      threshold: number;
    }
  >,
) {
  const artistResult = artistSearcher.search(artist);

  const nameResult = search(song, artistResult, {
    keySelector: chart => [chart.name],
    threshold: 1,
  });

  return nameResult;
}
