import {useState, useCallback, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import {cn} from '@/lib/utils';
import {downloadSong} from '@/lib/local-songs-folder';
import {useChartResultsCache, useTabResultsCache} from '@/hooks/useTrackResults';
import {TAB_SOURCES, type TabSearchResult} from '@/lib/tab-sources';
import {isGpSource} from '@/lib/tab-sources/types';
import {saveComposition} from '@/lib/local-db/tab-compositions';
import {toast} from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {BookOpen, Download, ExternalLink, Loader2, X} from 'lucide-react';
import {
  ChartInstruments,
  preFilterInstruments,
  RENDERED_INSTRUMENTS,
  AllowedInstrument,
  InstrumentImage,
} from '@/components/ChartInstruments';

export type TrackRef = {
  id: string;
  artist: string;
  name: string;
};

type DrawerTab = 'charts' | 'tabs';

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ChartsTab({
  chartResult,
}: {
  chartResult: ReturnType<ReturnType<typeof useChartResultsCache>['get']>;
}) {
  const [downloadStates, setDownloadStates] = useState<
    Record<string, 'not-downloading' | 'downloading' | 'downloaded' | 'failed'>
  >({});
  const [instrumentFilter, setInstrumentFilter] = useState<AllowedInstrument | null>(null);

  if (chartResult.state === 'loading' || chartResult.state === 'idle') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (chartResult.state === 'error') {
    return <div className="p-4 text-sm text-destructive">{chartResult.error}</div>;
  }

  if (chartResult.charts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
        <BookOpen className="h-6 w-6" />
        <p>No Encore charts found</p>
      </div>
    );
  }

  const availableInstruments = Array.from(
    new Set(
      chartResult.charts.flatMap(c =>
        Object.keys(preFilterInstruments(c)).filter(k =>
          (RENDERED_INSTRUMENTS as readonly string[]).includes(k),
        ),
      ),
    ),
  ) as AllowedInstrument[];

  const displayCharts = instrumentFilter
    ? chartResult.charts.filter(c => {
        const key = `diff_${instrumentFilter}` as keyof typeof c;
        return typeof c[key] === 'number' && (c[key] as number) >= 0;
      })
    : chartResult.charts;

  return (
    <div className="flex flex-col">
      {availableInstruments.length > 0 && (
        <div className="px-3 py-2 border-b border-border flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setInstrumentFilter(null)}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors',
              instrumentFilter === null
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}>
            All
          </button>
          {availableInstruments.map(inst => (
            <button
              key={inst}
              onClick={() => setInstrumentFilter(prev => (prev === inst ? null : inst))}
              className={cn(
                'rounded transition-colors p-0.5',
                instrumentFilter === inst
                  ? 'ring-2 ring-primary'
                  : 'opacity-60 hover:opacity-100',
              )}>
              <InstrumentImage instrument={inst} size="sm" />
            </button>
          ))}
          {instrumentFilter && (
            <span className="text-[10px] text-muted-foreground ml-1">
              {displayCharts.length} / {chartResult.charts.length}
            </span>
          )}
        </div>
      )}

      <div className="divide-y divide-border">
        {displayCharts.map(chart => {
          const state = downloadStates[chart.md5] ?? 'not-downloading';
          const instruments = preFilterInstruments(chart);

          async function handleDownload() {
            if (state !== 'not-downloading') return;
            setDownloadStates(prev => ({...prev, [chart.md5]: 'downloading'}));
            try {
              await downloadSong(chart.artist, chart.name, chart.charter, chart.file, {asSng: true});
              setDownloadStates(prev => ({...prev, [chart.md5]: 'downloaded'}));
            } catch {
              setDownloadStates(prev => ({...prev, [chart.md5]: 'failed'}));
            }
          }

          return (
            <div key={chart.md5} className="p-3 space-y-1.5">
              <p className="text-xs font-medium truncate">{chart.name}</p>
              <p className="text-xs text-muted-foreground truncate">by {chart.charter}</p>
              <div className="flex items-center gap-2">
                <ChartInstruments instruments={instruments} size="sm" />
                {chart.song_length != null && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {formatDuration(chart.song_length)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {(Object.keys(instruments) as AllowedInstrument[]).map(inst => {
                  const diffKey = `diff_${inst}` as keyof typeof chart;
                  const diff = chart[diffKey] as number | undefined;
                  if (diff == null || diff < 0) return null;
                  return (
                    <span key={inst} className="text-[10px] text-muted-foreground">
                      {inst.charAt(0).toUpperCase() + inst.slice(1)}:{' '}
                      {'★'.repeat(Math.max(1, Math.round((diff / 6) * 5)))}
                      {'☆'.repeat(5 - Math.max(1, Math.round((diff / 6) * 5)))}
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={state !== 'not-downloading'}
                  onClick={handleDownload}>
                  {state === 'downloading' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  <span className="ml-1">
                    {state === 'downloaded'
                      ? 'Downloaded'
                      : state === 'downloading'
                        ? 'Downloading...'
                        : state === 'failed'
                          ? 'Failed'
                          : 'Download'}
                  </span>
                </Button>
              </div>
            </div>
          );
        })}
        {displayCharts.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No charts with this instrument
          </div>
        )}
      </div>
    </div>
  );
}

function TabsTab({
  tabResult,
}: {
  tabResult: ReturnType<ReturnType<typeof useTabResultsCache>['get']>;
}) {
  const navigate = useNavigate();
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  async function openInBrowser(url: string) {
    const {openUrl} = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  }

  async function fetchGp5Bytes(result: TabSearchResult): Promise<ArrayBuffer> {
    const source = TAB_SOURCES.find(s => s.sourceId === result.sourceId);
    if (!source) throw new Error('Unknown source');
    if (!isGpSource(source)) throw new Error('Source does not support GP download');
    const url = await source.getDownloadUrl(result);
    const response = await tauriFetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return response.arrayBuffer();
  }

  async function handleOpenInEditor(result: TabSearchResult) {
    const id = `open-${result.sourceId}-${result.id}`;
    setActionLoadingId(id);
    try {
      const bytes = await fetchGp5Bytes(result);
      const compositionId = await saveComposition(bytes, {
        title: result.title,
        artist: result.artist,
        album: '',
        tempo: 120,
        instrument: 'guitar',
      });
      navigate(`/tab-editor/${compositionId}`);
    } catch (err) {
      toast.error(`Failed to open tab: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSaveFile(result: TabSearchResult) {
    const id = `save-${result.sourceId}-${result.id}`;
    setActionLoadingId(id);
    try {
      const bytes = await fetchGp5Bytes(result);
      const filename = `${result.artist} - ${result.title}.gp5`.replace(
        /[/\\?%*:|"<>]/g,
        '_',
      );
      const blob = new Blob([bytes], {type: 'application/octet-stream'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Saved ${filename}`);
    } catch (err) {
      toast.error(`Failed to save tab: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoadingId(null);
    }
  }

  const sourceName = (sourceId: string) =>
    TAB_SOURCES.find(s => s.sourceId === sourceId)?.name ?? sourceId;

  if (tabResult.state === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
        <BookOpen className="h-6 w-6" />
        <p>Click "Tabs" to search</p>
      </div>
    );
  }

  if (tabResult.state === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tabResult.state === 'error') {
    return <div className="p-4 text-sm text-destructive">{tabResult.error}</div>;
  }

  if (tabResult.tabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
        <BookOpen className="h-6 w-6" />
        <p>No tabs found</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="divide-y divide-border">
        {tabResult.tabs.map(result => {
          const rowKey = `${result.sourceId}-${result.id}`;
          const isOpenLoading = actionLoadingId === `open-${rowKey}`;
          const isSaveLoading = actionLoadingId === `save-${rowKey}`;
          const isAnyLoading = isOpenLoading || isSaveLoading;

          return (
            <div key={rowKey} className="p-3 space-y-1">
              <p className="text-xs font-medium truncate">{result.title}</p>
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {sourceName(result.sourceId)}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                {result.viewUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={isAnyLoading}
                    onClick={() => openInBrowser(result.viewUrl!)}>
                    <ExternalLink className="h-3 w-3" />
                    <span className="ml-1">View</span>
                  </Button>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={isAnyLoading || !result.hasGp}
                        onClick={() => handleOpenInEditor(result)}>
                        {isOpenLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <BookOpen className="h-3 w-3" />
                        )}
                        <span className="ml-1">Open</span>
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!result.hasGp && (
                    <TooltipContent>Requires Songsterr Plus login (coming soon)</TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={isAnyLoading || !result.hasGp}
                        onClick={() => handleSaveFile(result)}>
                        {isSaveLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        <span className="ml-1">Save</span>
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!result.hasGp && (
                    <TooltipContent>Requires Songsterr Plus login (coming soon)</TooltipContent>
                  )}
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function TrackDetailDrawer({
  track,
  chartCache,
  tabCache,
  headerExtra,
  onClose,
}: {
  track: TrackRef;
  chartCache: ReturnType<typeof useChartResultsCache>;
  tabCache: ReturnType<typeof useTabResultsCache>;
  headerExtra?: React.ReactNode;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('charts');
  const chartResult = chartCache.get(track.artist, track.name);
  const tabResult = tabCache.get(track.artist, track.name);

  const handleTabsClick = useCallback(() => {
    setActiveTab('tabs');
    tabCache.trigger(track.artist, track.name);
  }, [tabCache, track.artist, track.name]);

  useEffect(() => {
    setActiveTab('charts');
  }, [track.id]);

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[400px] flex flex-col border-l border-border bg-card shadow-xl z-20 overflow-hidden">
      <div className="shrink-0 p-4 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{track.name}</p>
            <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        {headerExtra}
      </div>

      <div className="shrink-0 flex border-b border-border">
        <button
          onClick={() => setActiveTab('charts')}
          className={cn(
            'flex-1 py-2 text-sm transition-colors',
            activeTab === 'charts'
              ? 'text-primary font-semibold border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}>
          Charts
        </button>
        <button
          onClick={handleTabsClick}
          className={cn(
            'flex-1 py-2 text-sm transition-colors',
            activeTab === 'tabs'
              ? 'text-primary font-semibold border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}>
          Tabs
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === 'charts' && <ChartsTab chartResult={chartResult} />}
        {activeTab === 'tabs' && <TabsTab tabResult={tabResult} />}
      </div>
    </div>
  );
}
