import {useMemo, useEffect, useState, useCallback} from 'react';
import {useInView} from 'react-intersection-observer';
import {Link} from 'react-router-dom';
import {Search as SearchIcon, Loader2, Bookmark, Play, Music} from 'lucide-react';
import debounce from 'debounce';
import {
  ChartInstruments,
  preFilterInstruments,
} from '@/components/ChartInstruments';
import {EncoreResponse, searchEncore} from '@/lib/search-encore';
import {ChartResponseEncore} from '@/lib/chartSelection';
import {getSavedCharts, saveChart, unsaveChart} from '@/lib/local-db/saved-charts';
import {fetchAndPersistChart, deletePersistedChart} from '@/lib/chart-persistent-store';
import {markChartDownloaded} from '@/lib/local-db/saved-charts';
import {cn} from '@/lib/utils';
import {formatDuration} from '@/lib/ui-utils';
import {DifficultyDots} from '@/components/shared/DifficultyDots';
import {toast} from 'sonner';

// In-memory cache so navigating back preserves the search results
let cachedSearchState: {
  query: string;
  results: EncoreResponse;
  page: number;
} | null = null;

export default function Search() {
  const [searchQuery, setSearchQuery] = useState(cachedSearchState?.query ?? '');
  const instrumentFilter = 'drums';

  const [filteredSongs, setFilteredSongs] = useState<EncoreResponse | null>(cachedSearchState?.results ?? null);
  const [page, setPage] = useState<number>(cachedSearchState?.page ?? 1);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const {ref: sentinelRef, inView} = useInView({
    root: null,
    rootMargin: '200px',
    threshold: 0,
  });

  // Saved charts state
  const [activeTab, setActiveTab] = useState<'search' | 'saved'>('search');
  const [savedCharts, setSavedCharts] = useState<ChartResponseEncore[]>([]);
  const [savedMd5s, setSavedMd5s] = useState<Set<string>>(new Set());
  const [loadingSaves, setLoadingSaves] = useState<Set<string>>(new Set());

  const loadSavedCharts = useCallback(async (search?: string) => {
    const charts = await getSavedCharts(search);
    setSavedCharts(charts);
    setSavedMd5s(new Set(charts.map(c => c.md5)));
  }, []);

  useEffect(() => {
    loadSavedCharts();
  }, [loadSavedCharts]);

  const handleToggleSave = useCallback(async (chart: ChartResponseEncore, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const md5 = chart.md5;
    if (loadingSaves.has(md5)) return;
    setLoadingSaves(prev => new Set(prev).add(md5));
    try {
      if (savedMd5s.has(md5)) {
        await unsaveChart(md5);
        await deletePersistedChart(md5);
        setSavedMd5s(prev => { const next = new Set(prev); next.delete(md5); return next; });
        setSavedCharts(prev => prev.filter(c => c.md5 !== md5));
        toast.success('Chart removed');
      } else {
        const toastId = toast.loading(`Downloading "${chart.name}"...`);
        try {
          await fetchAndPersistChart(md5);
          await saveChart(chart);
          await markChartDownloaded(md5);
          setSavedMd5s(prev => new Set(prev).add(md5));
          setSavedCharts(prev => [chart, ...prev]);
          toast.success(`"${chart.name}" saved for offline use`, {id: toastId});
        } catch (err) {
          toast.error(`Failed to download "${chart.name}"`, {id: toastId});
          throw err;
        }
      }
    } catch (err) {
      console.error('Failed to toggle save:', err);
    } finally {
      setLoadingSaves(prev => { const next = new Set(prev); next.delete(md5); return next; });
    }
  }, [savedMd5s, loadingSaves]);

  const debouncedFilterSongs = useMemo(
    () =>
      debounce(async (query: string, instrument: undefined | null | string) => {
        const results = await searchEncore(query, instrument, 1);
        setFilteredSongs(results);
        setPage(1);
        cachedSearchState = { query, results, page: 1 };
      }, 500),
    [],
  );

  const searchSongs = useCallback(
    (query: string) => {
      debouncedFilterSongs(query, instrumentFilter);
    },
    [debouncedFilterSongs],
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (activeTab === 'search') {
      searchSongs(query);
    } else {
      loadSavedCharts(query);
    }
  };

  useEffect(() => {
    // Skip initial fetch if we already have cached results
    if (cachedSearchState) return;
    searchSongs(searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'saved') {
      loadSavedCharts(searchQuery);
    }
  }, [activeTab]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const results = await searchEncore(
        searchQuery,
        instrumentFilter,
        nextPage,
      );
      setFilteredSongs(prev => {
        const prevData = prev?.data ?? [];
        const combined = [...prevData, ...results.data];
        const deduped = Array.from(
          new Map(combined.map(chart => [chart.md5, chart])).values(),
        );
        const updated = {
          ...results,
          data: deduped,
          found: results.found,
          out_of: results.out_of,
        };
        cachedSearchState = { query: searchQuery, results: updated, page: nextPage };
        return updated;
      });
      setPage(nextPage);
    } finally {
      setIsLoadingMore(false);
    }
  }, [page, searchQuery, instrumentFilter, isLoadingMore]);

  // Infinite scroll: observe sentinel and load next page when visible
  useEffect(() => {
    if (activeTab !== 'search') return;
    if (!filteredSongs) return;
    const hasMore = filteredSongs.data.length < filteredSongs.found;
    if (hasMore && inView && !isLoadingMore) {
      loadMore();
    }
  }, [filteredSongs, inView, isLoadingMore, loadMore, activeTab]);

  const displaySongs = activeTab === 'saved' ? savedCharts : filteredSongs?.data ?? [];
  const isLoading = activeTab === 'search' && filteredSongs == null;
  const isEmpty = displaySongs.length === 0 && !isLoading;

  return (
    <main className="min-h-screen w-full">
      <div className="mx-auto max-w-6xl px-6 py-8 md:px-12 md:py-12">
        {/* Header */}
        <header className="mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-tertiary-container/20 px-3 py-1">
            <Music className="h-3.5 w-3.5 text-tertiary" />
            <span className="font-mono text-xs uppercase tracking-widest text-tertiary">
              Drums
            </span>
          </div>

          <h1 className="font-headline text-4xl font-extrabold text-on-surface md:text-5xl">
            Drum Practice{' '}
            <span className="text-tertiary">Charts</span>
          </h1>
          <p className="mt-3 max-w-xl text-lg text-on-surface-variant">
            Search thousands of community charts and convert them to readable
            drum sheet music for your practice sessions.
          </p>

          {/* Search bar */}
          <div className="mt-8 flex flex-col gap-4">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <SearchIcon className="h-5 w-5 text-on-surface-variant" />
              </div>
              <input
                type="search"
                placeholder={
                  activeTab === 'saved'
                    ? 'Filter saved charts...'
                    : 'Search for songs, artists, charters and more...'
                }
                className="w-full rounded-xl bg-surface-container-high py-3 pl-12 pr-4 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-tertiary/40"
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>

            {/* Tab / filter row */}
            <div className="flex items-center gap-3">
              <button
                className={cn(
                  'rounded-lg px-4 py-2 font-mono text-sm transition-colors',
                  activeTab === 'search'
                    ? 'bg-tertiary-container/30 text-tertiary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
                )}
                onClick={() => setActiveTab('search')}
              >
                Search
              </button>
              <button
                className={cn(
                  'rounded-lg px-4 py-2 font-mono text-sm transition-colors',
                  activeTab === 'saved'
                    ? 'bg-tertiary-container/30 text-tertiary'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
                )}
                onClick={() => setActiveTab('saved')}
              >
                Saved Charts
              </button>

              {activeTab === 'search' && filteredSongs != null && (
                <span className="ml-auto font-mono text-xs text-on-surface-variant">
                  {filteredSongs.found.toLocaleString()} charts
                </span>
              )}
              {activeTab === 'saved' && savedCharts.length > 0 && (
                <span className="ml-auto font-mono text-xs text-on-surface-variant">
                  {savedCharts.length} saved
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Results */}
        <section>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Loader2 className="h-8 w-8 animate-spin text-tertiary" />
              <p className="font-mono text-sm text-on-surface-variant">
                Loading charts...
              </p>
            </div>
          ) : isEmpty ? (
            <div className="py-20 text-center">
              <p className="text-on-surface-variant">
                {activeTab === 'saved'
                  ? 'No saved charts yet. Search for charts and bookmark them to save for offline use.'
                  : 'No songs found matching your search.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {displaySongs.map(song => (
                  <Link
                    to={`/sheet-music/${song.md5}`}
                    key={song.md5}
                    className="group relative flex flex-col overflow-hidden rounded-2xl bg-surface-container-low transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-container"
                  >
                    {/* Notation preview area */}
                    <div className="relative flex h-36 items-center justify-center overflow-hidden bg-surface-container">
                      <img
                        src={`https://files.enchor.us/${song.albumArtMd5}.jpg`}
                        alt={`${song.name} album art`}
                        className="h-full w-full object-cover opacity-40"
                      />
                      {/* Play button overlay */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary/90 text-on-tertiary opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100 group-hover:scale-110">
                          <Play className="h-5 w-5 fill-current" />
                        </div>
                      </div>
                      {/* Save button */}
                      <button
                        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface/70 backdrop-blur-sm transition-colors hover:bg-surface"
                        onClick={(e) => handleToggleSave(song, e)}
                        disabled={loadingSaves.has(song.md5)}
                      >
                        {loadingSaves.has(song.md5) ? (
                          <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant" />
                        ) : (
                          <Bookmark
                            className={cn(
                              'h-4 w-4 transition-colors',
                              savedMd5s.has(song.md5)
                                ? 'fill-tertiary text-tertiary'
                                : 'text-on-surface-variant hover:text-on-surface',
                            )}
                          />
                        )}
                      </button>
                    </div>

                    {/* Card body */}
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-on-surface">
                          {song.name}
                        </h3>
                        <p className="truncate text-xs text-on-surface-variant">
                          {song.artist}
                        </p>
                      </div>

                      {/* Metadata row */}
                      <div className="mt-auto flex items-center gap-3">
                        {song.diff_drums != null && (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] uppercase text-on-surface-variant">
                              Diff
                            </span>
                            <DifficultyDots level={song.diff_drums} />
                          </div>
                        )}
                        {song.song_length != null && (
                          <span className="font-mono text-xs text-on-surface-variant">
                            {formatDuration(song.song_length)}
                          </span>
                        )}
                      </div>

                      {/* Instruments */}
                      <div className="flex flex-wrap gap-1">
                        <ChartInstruments
                          size="md"
                          classNames="h-5 w-5"
                          instruments={preFilterInstruments(song)}
                        />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {activeTab === 'search' && (
                <div ref={sentinelRef} className="flex h-16 items-center justify-center">
                  {isLoadingMore && (
                    <Loader2 className="h-5 w-5 animate-spin text-tertiary" />
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
