import {useState, useEffect, useCallback} from 'react';
import {Link} from 'react-router-dom';
import {
  FolderHeart, Loader2, Search, Play, Bookmark, HardDrive, Wifi,
  Music2, BookMarked,
} from 'lucide-react';
import debounce from 'debounce';
import {getSavedCharts, unsaveChart, type SavedChartEntry} from '@/lib/local-db/saved-charts';
import {getSavedCompositions, deleteComposition, type TabComposition} from '@/lib/local-db/tab-compositions';
import {getDrumsLibraryItems, type LibraryItem} from '@/lib/local-db/library';
import {deletePersistedChart} from '@/lib/chart-persistent-store';
import {cn} from '@/lib/utils';
import {toast} from 'sonner';
import {Toggle} from '@/components/ui/toggle';
import {DifficultyDots} from '@/components/shared/DifficultyDots';
import {formatDuration} from '@/lib/ui-utils';
import AddRepertoireItemDialog from '@/pages/guitar/repertoire/AddRepertoireItemDialog';

type Tab = 'chorus' | 'guitar' | 'bass' | 'drums' | 'keys';

const TABS: {id: Tab; label: string}[] = [
  {id: 'chorus', label: 'Rhythm / Chorus'},
  {id: 'guitar', label: 'Guitar'},
  {id: 'bass', label: 'Bass'},
  {id: 'drums', label: 'Drums'},
  {id: 'keys', label: 'Keys'},
];

export default function SavedChartsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('chorus');
  const [search, setSearch] = useState('');
  const [addToRepertoire, setAddToRepertoire] = useState<SavedChartEntry | null>(null);

  // Chorus state
  const [charts, setCharts] = useState<SavedChartEntry[]>([]);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [removingCharts, setRemovingCharts] = useState<Set<string>>(new Set());

  // Composition state (guitar / bass / keys)
  const [compositions, setCompositions] = useState<TabComposition[]>([]);
  const [compositionsLoading, setCompositionsLoading] = useState(false);
  const [removingComps, setRemovingComps] = useState<Set<number>>(new Set());

  // Drums state (merged)
  const [drumsItems, setDrumsItems] = useState<LibraryItem[]>([]);
  const [drumsLoading, setDrumsLoading] = useState(false);

  const loadChorus = useCallback(async (q?: string) => {
    setChartsLoading(true);
    const results = await getSavedCharts(q);
    setCharts(results);
    setChartsLoading(false);
  }, []);

  const loadCompositions = useCallback(async (instrument: string, q?: string) => {
    setCompositionsLoading(true);
    const results = await getSavedCompositions(instrument, q);
    setCompositions(results);
    setCompositionsLoading(false);
  }, []);

  const loadDrums = useCallback(async (q?: string) => {
    setDrumsLoading(true);
    const results = await getDrumsLibraryItems(q);
    setDrumsItems(results);
    setDrumsLoading(false);
  }, []);

  const loadTab = useCallback((tab: Tab, q?: string) => {
    const loaders: Record<Tab, (q?: string) => void> = {
      chorus: loadChorus,
      drums: loadDrums,
      guitar: (q) => loadCompositions('guitar', q),
      bass: (q) => loadCompositions('bass', q),
      keys: (q) => loadCompositions('keys', q),
    };
    loaders[tab](q);
  }, [loadChorus, loadDrums, loadCompositions]);

  useEffect(() => { loadTab(activeTab); }, [activeTab, loadTab]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((q: string) => loadTab(activeTab, q || undefined), 300),
    [activeTab, loadTab],
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    debouncedSearch(q);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSearch('');
  };

  const handleRemoveChart = async (chart: SavedChartEntry, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (removingCharts.has(chart.md5)) return;
    setRemovingCharts(prev => new Set(prev).add(chart.md5));
    try {
      await unsaveChart(chart.md5);
      await deletePersistedChart(chart.md5);
      setCharts(prev => prev.filter(c => c.md5 !== chart.md5));
      toast.success(`"${chart.name}" removed from library`);
    } catch {
      toast.error(`Failed to remove "${chart.name}"`);
    } finally {
      setRemovingCharts(prev => {const next = new Set(prev); next.delete(chart.md5); return next;});
    }
  };

  const handleRemoveComposition = async (comp: TabComposition, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (removingComps.has(comp.id)) return;
    setRemovingComps(prev => new Set(prev).add(comp.id));
    try {
      await deleteComposition(comp.id);
      if (activeTab === 'drums') {
        loadDrums(search || undefined);
      } else {
        setCompositions(prev => prev.filter(c => c.id !== comp.id));
      }
      toast.success(`"${comp.title}" removed from library`);
    } catch {
      toast.error(`Failed to remove "${comp.title}"`);
    } finally {
      setRemovingComps(prev => {const next = new Set(prev); next.delete(comp.id); return next;});
    }
  };

  const loadingByTab: Record<Tab, boolean> = {
    chorus: chartsLoading,
    drums: drumsLoading,
    guitar: compositionsLoading,
    bass: compositionsLoading,
    keys: compositionsLoading,
  };
  const isLoading = loadingByTab[activeTab];

  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderHeart className="h-6 w-6 text-tertiary" />
            <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
              Library
            </h1>
          </div>
          <p className="text-on-surface-variant text-sm max-w-xl leading-relaxed">
            Your saved charts and compositions, organized by instrument.
          </p>
        </header>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(tab => (
            <Toggle
              key={tab.id}
              pressed={activeTab === tab.id}
              onPressedChange={() => handleTabChange(tab.id)}
              size="sm"
            >
              {tab.label}
            </Toggle>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-on-surface-variant" />
          </div>
          <input
            type="search"
            placeholder={activeTab === 'chorus' ? 'Filter charts\u2026' : 'Filter compositions\u2026'}
            className="w-full rounded-xl bg-surface-container-high py-2.5 pl-10 pr-4 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-tertiary/40"
            value={search}
            onChange={handleSearch}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-tertiary" />
          </div>
        ) : activeTab === 'chorus' ? (
          <ChorusSection
            charts={charts}
            removing={removingCharts}
            onRemove={handleRemoveChart}
            onAddToRepertoire={setAddToRepertoire}
            search={search}
          />
        ) : activeTab === 'drums' ? (
          <DrumsSection
            items={drumsItems}
            removingComps={removingComps}
            removingCharts={removingCharts}
            onRemoveComposition={handleRemoveComposition}
            onRemoveChart={handleRemoveChart}
            search={search}
          />
        ) : (
          <CompositionsSection
            compositions={compositions}
            instrument={activeTab}
            removing={removingComps}
            onRemove={handleRemoveComposition}
            search={search}
          />
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
            linkedItem: {
              kind: 'saved_chart',
              md5: addToRepertoire.md5,
              name: addToRepertoire.name,
              artist: addToRepertoire.artist,
            },
          }}
        />
      )}
    </div>
  );
}

function ChorusSection({
  charts,
  removing,
  onRemove,
  onAddToRepertoire,
  search,
}: {
  charts: SavedChartEntry[];
  removing: Set<string>;
  onRemove: (chart: SavedChartEntry, e: React.MouseEvent) => void;
  onAddToRepertoire: (chart: SavedChartEntry) => void;
  search: string;
}) {
  if (charts.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <FolderHeart className="mx-auto h-12 w-12 text-outline opacity-50" />
        <p className="text-on-surface-variant">
          {search ? 'No saved charts match your search.' : 'No saved charts yet. Search for drum charts and bookmark them.'}
        </p>
        {!search && (
          <Link to="/sheet-music/search" className="inline-flex items-center gap-2 text-sm font-bold text-tertiary hover:underline">
            Browse Charts
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="font-mono text-xs text-outline uppercase tracking-widest">
        {charts.length} saved · {charts.filter(c => c.isDownloaded).length} offline
      </p>
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
                onClick={(e) => onRemove(chart, e)}
                disabled={removing.has(chart.md5)}
                title="Remove from library"
              >
                {removing.has(chart.md5)
                  ? <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
                  : <Bookmark className="h-4 w-4 fill-tertiary text-tertiary" />
                }
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
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onAddToRepertoire(chart); }}
                  title="Add to RepertoireIQ"
                >
                  <BookMarked className="h-3 w-3" />
                  Repertoire
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function CompositionCard({
  comp,
  removing,
  onRemove,
  badge,
  instrumentLabel,
}: {
  comp: TabComposition;
  removing: Set<number>;
  onRemove: (comp: TabComposition, e: React.MouseEvent) => void;
  badge?: string;
  instrumentLabel?: string;
}) {
  return (
    <Link
      to={`/tab-editor/${comp.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-surface-container-low transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container"
    >
      <div className="relative flex h-28 items-center justify-center overflow-hidden bg-surface-container">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary opacity-60 group-hover:opacity-100 transition-opacity">
          <Music2 className="h-6 w-6" />
        </div>
        {badge && (
          <div className="absolute left-3 top-3 z-10 rounded-full bg-surface/70 px-2 py-0.5 text-[10px] font-mono font-semibold backdrop-blur-sm text-outline">
            {badge}
          </div>
        )}
        <button
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface"
          onClick={(e) => onRemove(comp, e)}
          disabled={removing.has(comp.id)}
          title="Remove from library"
        >
          {removing.has(comp.id)
            ? <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
            : <Bookmark className="h-4 w-4 fill-tertiary text-tertiary" />
          }
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-on-surface">{comp.title || 'Untitled'}</h3>
          <p className="truncate text-xs text-on-surface-variant">{comp.artist || 'Unknown artist'}</p>
        </div>
        <div className="mt-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-primary">
            {comp.tempo} BPM
          </span>
          {instrumentLabel && (
            <span className="text-[10px] font-mono text-outline uppercase">
              {instrumentLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function CompositionsSection({
  compositions,
  instrument,
  removing,
  onRemove,
  search,
}: {
  compositions: TabComposition[];
  instrument: string;
  removing: Set<number>;
  onRemove: (comp: TabComposition, e: React.MouseEvent) => void;
  search: string;
}) {
  const instrumentLabel = instrument.charAt(0).toUpperCase() + instrument.slice(1);

  if (compositions.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <Music2 className="mx-auto h-12 w-12 text-outline opacity-50" />
        <p className="text-on-surface-variant">
          {search
            ? `No ${instrumentLabel} compositions match your search.`
            : `No saved ${instrumentLabel} compositions yet. Open the Tab Editor and save a composition.`}
        </p>
        {!search && (
          <Link to="/tab-editor" className="inline-flex items-center gap-2 text-sm font-bold text-tertiary hover:underline">
            Open Tab Editor
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="font-mono text-xs text-outline uppercase tracking-widest">
        {compositions.length} composition{compositions.length !== 1 ? 's' : ''}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {compositions.map(comp => (
          <CompositionCard
            key={comp.id}
            comp={comp}
            removing={removing}
            onRemove={onRemove}
            instrumentLabel={instrumentLabel}
          />
        ))}
      </div>
    </>
  );
}

function DrumsSection({
  items,
  removingComps,
  removingCharts,
  onRemoveComposition,
  onRemoveChart,
  search,
}: {
  items: LibraryItem[];
  removingComps: Set<number>;
  removingCharts: Set<string>;
  onRemoveComposition: (comp: TabComposition, e: React.MouseEvent) => void;
  onRemoveChart: (chart: SavedChartEntry, e: React.MouseEvent) => void;
  search: string;
}) {
  if (items.length === 0) {
    return (
      <div className="py-20 text-center space-y-3">
        <Music2 className="mx-auto h-12 w-12 text-outline opacity-50" />
        <p className="text-on-surface-variant">
          {search ? 'No drum items match your search.' : 'No saved drum content yet.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="font-mono text-xs text-outline uppercase tracking-widest">
        {items.length} item{items.length !== 1 ? 's' : ''}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => {
          if (item.sourceType === 'composition') {
            const comp = item.data;
            return (
              <CompositionCard
                key={`comp-${comp.id}`}
                comp={comp}
                removing={removingComps}
                onRemove={onRemoveComposition}
                badge="Tab"
              />
            );
          }

          const chart = item.data as SavedChartEntry;
          return (
            <Link
              to={`/sheet-music/${chart.md5}`}
              key={`chorus-${chart.md5}`}
              className="group relative flex flex-col overflow-hidden rounded-2xl bg-surface-container-low transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container"
            >
              <div className="relative flex h-28 items-center justify-center overflow-hidden bg-surface-container">
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
                <div className="absolute left-3 top-3 z-10 rounded-full bg-surface/70 px-2 py-0.5 text-[10px] font-mono font-semibold backdrop-blur-sm text-outline">
                  Chorus
                </div>
                <button
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface"
                  onClick={(e) => onRemoveChart(chart, e)}
                  disabled={removingCharts.has(chart.md5)}
                  title="Remove from library"
                >
                  {removingCharts.has(chart.md5)
                    ? <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
                    : <Bookmark className="h-4 w-4 fill-tertiary text-tertiary" />
                  }
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-on-surface">{chart.name}</h3>
                  <p className="truncate text-xs text-on-surface-variant">{chart.artist}</p>
                </div>
                {chart.diff_drums != null && (
                  <div className="mt-auto flex items-center gap-1.5">
                    <span className="font-mono text-[10px] uppercase text-on-surface-variant">Diff</span>
                    <DifficultyDots level={chart.diff_drums} />
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
