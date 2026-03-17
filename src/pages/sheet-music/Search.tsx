import {useMemo, useEffect, useState, useCallback} from 'react';
import {useInView} from 'react-intersection-observer';
import {Link} from 'react-router-dom';
import {Search as SearchIcon, Loader2, Bookmark} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import debounce from 'debounce';
import {
  ChartInstruments,
  preFilterInstruments,
} from '@/components/ChartInstruments';
import {EncoreResponse, searchEncore} from '@/lib/search-encore';
import {ChartResponseEncore} from '@/lib/chartSelection';
import {getSavedCharts, saveChart, unsaveChart} from '@/lib/local-db/saved-charts';
import {isChartCached, fetchAndCacheChart, deleteCachedChart} from '@/lib/sheet-music-cache';
import {cn} from '@/lib/utils';
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
        await deleteCachedChart(md5);
        setSavedMd5s(prev => { const next = new Set(prev); next.delete(md5); return next; });
        setSavedCharts(prev => prev.filter(c => c.md5 !== md5));
        toast.success('Chart removed');
      } else {
        const toastId = toast.loading(`Downloading "${chart.name}"...`);
        try {
          if (!(await isChartCached(md5))) {
            await fetchAndCacheChart(md5);
          }
          await saveChart(chart);
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
    <main className="min-h-screen bg-background w-full">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            Sheet Music Search
          </h1>
          <p className="text-muted-foreground mb-6 text-sm sm:text-base">
            Convert Drum Charts to Sheet Music
          </p>

          <div className="flex flex-col gap-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <SearchIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              </div>
              <Input
                type="search"
                placeholder={activeTab === 'saved'
                  ? 'Filter saved charts...'
                  : 'Search for songs, artists, charters and more...'}
                className="pl-9 sm:pl-10 w-full"
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>
            <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
              <button
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                  activeTab === 'search'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setActiveTab('search')}
              >
                Search
              </button>
              <button
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                  activeTab === 'saved'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setActiveTab('saved')}
              >
                Saved Charts
              </button>
            </div>
          </div>
        </header>

        <section>
          <h2 className="text-2xl font-semibold mb-4">
            {activeTab === 'saved'
              ? `Saved Charts${savedCharts.length > 0 ? ` (${savedCharts.length})` : ''}`
              : searchQuery
                ? 'Search Results'
                : 'Recently Added Sheet Music'}{' '}
            {activeTab === 'search' && filteredSongs != null ? `(${filteredSongs?.found} charts)` : ''}
          </h2>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading charts...</p>
            </div>
          ) : isEmpty ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {activeTab === 'saved'
                  ? 'No saved charts yet. Search for charts and bookmark them to save for offline use.'
                  : 'No songs found matching your search.'}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {displaySongs.map(song => (
                  <Link
                    to={`/sheet-music/${song.md5}`}
                    key={song.md5}
                    className="flex items-stretch bg-card rounded-lg border border-border hover:bg-accent transition-colors cursor-pointer overflow-hidden">
                    <div className="flex-shrink-0">
                      <img
                        src={`https://files.enchor.us/${song.albumArtMd5}.jpg`}
                        alt={`${song.name} album art`}
                        width={160}
                        height={160}
                        className="h-full w-[96px] sm:w-[120px] lg:w-[160px] object-cover"
                      />
                    </div>

                    <div className="flex flex-col flex-grow p-3">
                      <div className="flex-grow">
                        <h3 className="text-sm sm:text-base lg:text-lg font-bold">
                          {song.name}{' '}
                          <span className="text-muted-foreground">by</span>{' '}
                          {song.artist}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          charted by {song.charter}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1 sm:gap-2 mt-1 sm:mt-2">
                        <ChartInstruments
                          size="md"
                          classNames="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7"
                          instruments={preFilterInstruments(song)}
                        />
                      </div>
                    </div>

                    <button
                      className="flex-shrink-0 self-center px-3"
                      onClick={(e) => handleToggleSave(song, e)}
                      disabled={loadingSaves.has(song.md5)}
                    >
                      {loadingSaves.has(song.md5) ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <Bookmark
                          className={cn(
                            'h-5 w-5 transition-colors',
                            savedMd5s.has(song.md5)
                              ? 'fill-primary text-primary'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        />
                      )}
                    </button>
                  </Link>
                ))}
              </div>
              {activeTab === 'search' && <div ref={sentinelRef} className="h-8" />}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
