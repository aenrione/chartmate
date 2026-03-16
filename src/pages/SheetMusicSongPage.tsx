import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isChartCached, fetchAndCacheChart, listCachedFiles, readCachedFile } from '@/lib/sheet-music-cache';
import { parseChartFile } from '@eliwhite/scan-chart';
import { searchAdvanced } from '@/lib/search-encore';
import {
  getBasename,
  getExtension,
  hasAudioExtension,
  hasAudioName,
  hasChartExtension,
  hasChartName,
  hasIniName,
} from '@/lib/src-shared/utils';
import { ChartResponseEncore } from '@/lib/chartSelection';
import { Files, ParsedChart } from '@/lib/preview/chorus-chart-processing';
import SongView from './sheet-music/SongView';

type LoadedData = {
  metadata: ChartResponseEncore;
  chart: ParsedChart;
  audioFiles: Files;
};

// In-memory cache so navigating back doesn't re-fetch
const chartCache = new Map<string, LoadedData>();

async function readCachedFilesAsFiles(md5: string): Promise<{ fileName: string; data: Uint8Array }[]> {
  const fileNames = await listCachedFiles(md5);
  const results = await Promise.all(
    fileNames.map(async name => {
      const file = await readCachedFile(md5, name);
      const buffer = await file.arrayBuffer();
      return { fileName: name, data: new Uint8Array(buffer) };
    })
  );
  return results;
}

function findChartData(files: { fileName: string; data: Uint8Array }[]) {
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

async function fetchMetadata(md5: string): Promise<ChartResponseEncore | null> {
  try {
    const results = await searchAdvanced({ hash: md5, per_page: 1 });
    return results.data[0] ?? null;
  } catch {
    return null;
  }
}

function getIniContents(files: { fileName: string; data: Uint8Array }[]): string | null {
  const iniFile = files.find(f => hasIniName(f.fileName));
  if (!iniFile) return null;
  return new TextDecoder().decode(iniFile.data);
}

export default function SheetMusicSongPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<LoadedData | null>(() =>
    slug ? chartCache.get(slug) ?? null : null
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Loading chart...');

  useEffect(() => {
    if (!slug) return;
    // Already have cached data for this slug
    if (chartCache.has(slug)) {
      setData(chartCache.get(slug)!);
      return;
    }

    let cancelled = false;

    async function loadChart() {
      try {
        setStatus('Checking cache...');
        if (!(await isChartCached(slug!))) {
          setStatus('Downloading chart...');
          await fetchAndCacheChart(slug!);
        }

        setStatus('Reading files...');
        const files = await readCachedFilesAsFiles(slug!);

        setStatus('Fetching metadata...');
        let metadata = await fetchMetadata(slug!);

        // If API fetch fails, try to construct minimal metadata from ini
        if (!metadata) {
          const iniText = getIniContents(files);
          // Construct minimal ChartResponseEncore from ini file or defaults
          const parsedIni: Record<string, string> = {};
          if (iniText) {
            for (const line of iniText.split('\n')) {
              const match = line.match(/^(\w+)\s*=\s*(.*)$/);
              if (match) parsedIni[match[1].trim()] = match[2].trim();
            }
          }
          metadata = {
            md5: slug!,
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
        const { chartData, format } = findChartData(files);
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
          const loaded = { metadata, chart: parsedChart, audioFiles };
          chartCache.set(slug!, loaded);
          setData(loaded);
        }
      } catch (err: any) {
        console.error('Failed to load chart:', err);
        if (!cancelled) setError(err instanceof Error ? err.message : String(err) || 'Failed to load chart');
      }
    }

    loadChart();
    return () => { cancelled = true; };
  }, [slug]);

  if (!slug) return null;
  if (error) return <div className="flex-1 flex items-center justify-center"><span className="text-destructive">Error: {error}</span></div>;
  if (!data) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{status}</span>
    </div>
  );

  return (
    <SongView
      metadata={data.metadata}
      chart={data.chart}
      audioFiles={data.audioFiles}
    />
  );
}
