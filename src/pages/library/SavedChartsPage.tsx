import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FolderHeart, Loader2, Search, Play, Bookmark, HardDrive, Wifi, BookMarked } from 'lucide-react';
import debounce from 'debounce';
import { getSavedCharts, unsaveChart, SavedChartEntry } from '@/lib/local-db/saved-charts';
import { deletePersistedChart } from '@/lib/chart-persistent-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ChartInstruments, preFilterInstruments } from '@/components/ChartInstruments';
import { DifficultyDots } from '@/components/shared/DifficultyDots';
import { formatDuration } from '@/lib/ui-utils';
import AddRepertoireItemDialog from '@/pages/guitar/repertoire/AddRepertoireItemDialog';

export default function SavedChartsPage() {
  const [charts, setCharts] = useState<SavedChartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [addToRepertoire, setAddToRepertoire] = useState<SavedChartEntry | null>(null);

  const load = useCallback(async (q?: string) => {
    const results = await getSavedCharts(q);
    setCharts(results);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((q: string) => load(q), 300),
    [load],
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    debouncedSearch(q);
  };

  const handleRemove = async (chart: SavedChartEntry, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (removing.has(chart.md5)) return;
    setRemoving(prev => new Set(prev).add(chart.md5));
    try {
      await unsaveChart(chart.md5);
      await deletePersistedChart(chart.md5);
      setCharts(prev => prev.filter(c => c.md5 !== chart.md5));
      toast.success(`"${chart.name}" removed from library`);
    } catch {
      toast.error(`Failed to remove "${chart.name}"`);
    } finally {
      setRemoving(prev => { const next = new Set(prev); next.delete(chart.md5); return next; });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderHeart className="h-6 w-6 text-tertiary" />
            <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
              Saved Charts
            </h1>
          </div>
          <p className="text-on-surface-variant text-sm max-w-xl leading-relaxed">
            Your offline collection of drum charts. Charts with the{' '}
            <HardDrive className="inline h-3.5 w-3.5 text-tertiary" /> icon are stored on your device and open without internet.
          </p>
        </header>

        <div className="relative max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-on-surface-variant" />
          </div>
          <input
            type="search"
            placeholder="Filter saved charts..."
            className="w-full rounded-xl bg-surface-container-high py-2.5 pl-10 pr-4 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-tertiary/40"
            value={search}
            onChange={handleSearch}
          />
        </div>

        {!loading && charts.length > 0 && (
          <p className="font-mono text-xs text-outline uppercase tracking-widest">
            {charts.length} saved · {charts.filter(c => c.isDownloaded).length} offline
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-tertiary" />
          </div>
        ) : charts.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <FolderHeart className="mx-auto h-12 w-12 text-outline opacity-50" />
            <p className="text-on-surface-variant">
              {search
                ? 'No saved charts match your search.'
                : 'No saved charts yet. Search for drum charts and bookmark them.'}
            </p>
            {!search && (
              <Link
                to="/sheet-music/search"
                className="inline-flex items-center gap-2 text-sm font-bold text-tertiary hover:underline"
              >
                Browse Charts
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {charts.map(chart => (
              <Link
                to={`/sheet-music/${chart.md5}`}
                key={chart.md5}
                className="group relative flex flex-col overflow-hidden rounded-2xl bg-surface-container-low transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container"
              >
                <div className="relative flex h-36 items-center justify-center overflow-hidden bg-surface-container">
                  <img
                    src={`https://files.enchor.us/${chart.albumArtMd5}.jpg`}
                    alt={`${chart.name} album art`}
                    className="h-full w-full object-cover opacity-40"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary/90 text-on-tertiary opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100 group-hover:scale-110">
                      <Play className="h-5 w-5 fill-current" />
                    </div>
                  </div>
                  <div className={cn(
                    'absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold backdrop-blur-sm',
                    chart.isDownloaded
                      ? 'bg-tertiary-container/80 text-on-tertiary-container'
                      : 'bg-surface/70 text-outline',
                  )}>
                    {chart.isDownloaded
                      ? <><HardDrive className="h-3 w-3" /> Offline</>
                      : <><Wifi className="h-3 w-3" /> Online only</>
                    }
                  </div>
                  <button
                    className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface"
                    onClick={(e) => handleRemove(chart, e)}
                    disabled={removing.has(chart.md5)}
                    title="Remove from library"
                  >
                    {removing.has(chart.md5) ? (
                      <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
                    ) : (
                      <Bookmark className="h-4 w-4 fill-tertiary text-tertiary" />
                    )}
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-on-surface">{chart.name}</h3>
                    <p className="truncate text-xs text-on-surface-variant">{chart.artist}</p>
                  </div>
                  <div className="mt-auto flex items-center gap-3">
                    {chart.diff_drums != null && (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] uppercase text-on-surface-variant">Diff</span>
                        <DifficultyDots level={chart.diff_drums} />
                      </div>
                    )}
                    {chart.song_length != null && (
                      <span className="font-mono text-xs text-on-surface-variant">
                        {formatDuration(chart.song_length)}
                      </span>
                    )}
                    <button
                      className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); setAddToRepertoire(chart); }}
                      title="Add to RepertoireIQ"
                    >
                      <BookMarked className="h-3 w-3" />
                      Repertoire
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <ChartInstruments size="md" classNames="h-5 w-5" instruments={preFilterInstruments(chart)} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {addToRepertoire && (
        <AddRepertoireItemDialog
          open={!!addToRepertoire}
          onOpenChange={open => { if (!open) setAddToRepertoire(null); }}
          onSaved={() => toast.success(`"${addToRepertoire.name}" added to RepertoireIQ`)}
          prefill={{
            itemType: 'song',
            title: addToRepertoire.name,
            artist: addToRepertoire.artist,
            referenceType: 'saved_chart',
            referenceId: addToRepertoire.md5,
          }}
        />
      )}
    </div>
  );
}
