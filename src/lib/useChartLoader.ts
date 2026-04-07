import {useEffect, useState} from 'react';
import {isChartCached, fetchAndCacheChart, listCachedFiles, readCachedFile} from '@/lib/sheet-music-cache';
import {parseChartFile} from '@eliwhite/scan-chart';
import {searchAdvanced} from '@/lib/search-encore';
import {
  getBasename,
  getExtension,
  hasAudioExtension,
  hasAudioName,
  hasChartExtension,
  hasChartName,
  hasIniName,
} from '@/lib/src-shared/utils';
import {ChartResponseEncore} from '@/lib/chartSelection';
import {Files, ParsedChart} from '@/lib/preview/chorus-chart-processing';

export type ChartLoadResult = {
  metadata: ChartResponseEncore;
  chart: ParsedChart;
  audioFiles: Files;
};

// In-memory cache so re-renders don't re-fetch
const loadCache = new Map<string, ChartLoadResult>();

async function readCachedFilesAsFiles(md5: string): Promise<{fileName: string; data: Uint8Array}[]> {
  const fileNames = await listCachedFiles(md5);
  return Promise.all(
    fileNames.map(async name => {
      const file = await readCachedFile(md5, name);
      const buffer = await file.arrayBuffer();
      return {fileName: name, data: new Uint8Array(buffer)};
    }),
  );
}

function findChartData(files: {fileName: string; data: Uint8Array}[]) {
  const chartFiles = files
    .filter(f => hasChartExtension(f.fileName))
    .sort((a, b) => {
      const aIsChart = hasChartName(a.fileName) ? 1 : 0;
      const bIsChart = hasChartName(b.fileName) ? 1 : 0;
      if (aIsChart !== bIsChart) return bIsChart - aIsChart;
      const aIsMid = getExtension(a.fileName).toLowerCase() === 'mid' ? 1 : 0;
      const bIsMid = getExtension(b.fileName).toLowerCase() === 'mid' ? 1 : 0;
      return bIsMid - aIsMid;
    });

  if (chartFiles.length === 0) throw new Error('No chart file found');
  return {
    chartData: chartFiles[0].data,
    format: (getExtension(chartFiles[0].fileName).toLowerCase() === 'mid'
      ? 'mid'
      : 'chart') as 'mid' | 'chart',
  };
}

function findAudioFiles(files: Files): Files {
  return files.filter(
    f =>
      hasAudioExtension(f.fileName) &&
      hasAudioName(f.fileName) &&
      !['preview', 'crowd'].includes(getBasename(f.fileName).toLowerCase()),
  );
}

function getIniContents(files: {fileName: string; data: Uint8Array}[]): string | null {
  const iniFile = files.find(f => hasIniName(f.fileName));
  if (!iniFile) return null;
  return new TextDecoder().decode(iniFile.data);
}

async function fetchMetadata(md5: string): Promise<ChartResponseEncore | null> {
  try {
    const results = await searchAdvanced({hash: md5, per_page: 1});
    return results.data[0] ?? null;
  } catch {
    return null;
  }
}

export type ChartLoaderState = {
  data: ChartLoadResult | null;
  loading: boolean;
  error: string | null;
  status: string;
};

/**
 * Hook that loads a chart by MD5 hash — fetches .sng from Encore,
 * caches locally, parses chart data, and extracts audio files.
 */
export function useChartLoader(md5: string | null): ChartLoaderState {
  const [data, setData] = useState<ChartLoadResult | null>(() =>
    md5 ? loadCache.get(md5) ?? null : null,
  );
  const [loading, setLoading] = useState(!data && !!md5);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading chart...');

  useEffect(() => {
    if (!md5) {
      setData(null);
      setLoading(false);
      return;
    }

    if (loadCache.has(md5)) {
      setData(loadCache.get(md5)!);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        setStatus('Checking cache...');
        if (!(await isChartCached(md5!))) {
          setStatus('Downloading chart...');
          await fetchAndCacheChart(md5!);
        }

        setStatus('Reading files...');
        const files = await readCachedFilesAsFiles(md5!);

        setStatus('Fetching metadata...');
        let metadata = await fetchMetadata(md5!);

        if (!metadata) {
          const iniText = getIniContents(files);
          const parsedIni: Record<string, string> = {};
          if (iniText) {
            for (const line of iniText.split('\n')) {
              const match = line.match(/^(\w+)\s*=\s*(.*)$/);
              if (match) parsedIni[match[1].trim()] = match[2].trim();
            }
          }
          metadata = {
            md5: md5!,
            name: parsedIni['name'] ?? 'Unknown',
            artist: parsedIni['artist'] ?? 'Unknown',
            charter: parsedIni['charter'] ?? parsedIni['frets'] ?? 'Unknown',
            hasVideoBackground: false,
            albumArtMd5: '',
            notesData: {} as any,
            modifiedTime: new Date().toISOString(),
            song_length: parsedIni['song_length'] ? parseInt(parsedIni['song_length']) : undefined,
          } as ChartResponseEncore;
        }

        setStatus('Parsing chart...');
        const {chartData, format} = findChartData(files);
        const iniChartModifiers = Object.assign(
          {
            song_length: 0,
            hopo_frequency: 0,
            eighthnote_hopo: false,
            multiplier_note: 0,
            sustain_cutoff_threshold: -1,
            chord_snap_threshold: 0,
            five_lane_drums: false,
            pro_drums: false,
          },
          metadata,
        );
        const parsedChart = parseChartFile(chartData, format, iniChartModifiers);
        const audioFiles = findAudioFiles(files);

        if (!cancelled) {
          const result = {metadata, chart: parsedChart, audioFiles};
          loadCache.set(md5!, result);
          setData(result);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [md5]);

  return {data, loading, error, status};
}
