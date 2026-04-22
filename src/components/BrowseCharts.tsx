import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { searchEncore, searchAdvanced, type EncoreResponse } from '@/lib/search-encore';
import type { ChartResponseEncore } from '@/lib/chartSelection';
import { ChartInstruments, preFilterInstruments } from '@/components/ChartInstruments';
import { downloadSong } from '@/lib/local-songs-folder';
import { removeStyleTags, formatDuration } from '@/lib/ui-utils';
import { getLocalDb } from '@/lib/local-db/client';
import { toast } from 'sonner';
import { SlidersHorizontal, X, Search, Loader2 } from 'lucide-react';

const INSTRUMENTS = [
  { value: '__all__', label: 'All Instruments' },
  { value: 'guitar', label: 'Guitar' },
  { value: 'bass', label: 'Bass' },
  { value: 'drums', label: 'Drums' },
  { value: 'keys', label: 'Keys' },
  { value: 'vocals', label: 'Vocals' },
  { value: 'rhythm', label: 'Rhythm' },
  { value: 'guitarghl', label: 'Guitar (6-fret)' },
  { value: 'bassghl', label: 'Bass (6-fret)' },
] as const;

const DIFFICULTIES = [
  { value: '__all__', label: 'All Difficulties' },
  { value: 'expert', label: 'Expert' },
  { value: 'hard', label: 'Hard' },
  { value: 'medium', label: 'Medium' },
  { value: 'easy', label: 'Easy' },
] as const;

const DRUM_TYPES = [
  { value: '__all__', label: 'All Drum Types' },
  { value: 'fourLane', label: '4-Lane' },
  { value: 'fourLanePro', label: '4-Lane Pro' },
  { value: 'fiveLane', label: '5-Lane' },
] as const;

// -- Advanced search types --

type TextFilter = { value: string; exact: boolean; exclude: boolean };

type AdvancedFilters = {
  name: TextFilter;
  artist: TextFilter;
  album: TextFilter;
  genre: TextFilter;
  year: TextFilter;
  charter: TextFilter;
  minLength: string;
  maxLength: string;
  minIntensity: string;
  maxIntensity: string;
  minAverageNPS: string;
  maxAverageNPS: string;
  minMaxNPS: string;
  maxMaxNPS: string;
  minYear: string;
  maxYear: string;
  modifiedAfter: string;
  hash: string;
  trackHash: string;
  hasSoloSections: boolean | null;
  hasForcedNotes: boolean | null;
  hasOpenNotes: boolean | null;
  hasTapNotes: boolean | null;
  hasLyrics: boolean | null;
  hasVocals: boolean | null;
  hasRollLanes: boolean | null;
  has2xKick: boolean | null;
  hasIssues: boolean | null;
  hasVideoBackground: boolean | null;
  modchart: boolean | null;
};

const EMPTY_TEXT_FILTER: TextFilter = { value: '', exact: false, exclude: false };

function defaultAdvancedFilters(): AdvancedFilters {
  return {
    name: { ...EMPTY_TEXT_FILTER },
    artist: { ...EMPTY_TEXT_FILTER },
    album: { ...EMPTY_TEXT_FILTER },
    genre: { ...EMPTY_TEXT_FILTER },
    year: { ...EMPTY_TEXT_FILTER },
    charter: { ...EMPTY_TEXT_FILTER },
    minLength: '',
    maxLength: '',
    minIntensity: '',
    maxIntensity: '',
    minAverageNPS: '',
    maxAverageNPS: '',
    minMaxNPS: '',
    maxMaxNPS: '',
    minYear: '',
    maxYear: '',
    modifiedAfter: '',
    hash: '',
    trackHash: '',
    hasSoloSections: null,
    hasForcedNotes: null,
    hasOpenNotes: null,
    hasTapNotes: null,
    hasLyrics: null,
    hasVocals: null,
    hasRollLanes: null,
    has2xKick: null,
    hasIssues: null,
    hasVideoBackground: null,
    modchart: null,
  };
}

function buildAdvancedPayload(
  filters: AdvancedFilters,
  instrument: string | null,
  difficulty: string | null,
  drumType: string | null,
  page: number,
) {
  const numOrNull = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  return {
    instrument,
    difficulty,
    drumType,
    source: 'website' as const,
    name: filters.name,
    artist: filters.artist,
    album: filters.album,
    genre: filters.genre,
    year: filters.year,
    charter: filters.charter,
    minLength: numOrNull(filters.minLength),
    maxLength: numOrNull(filters.maxLength),
    minIntensity: numOrNull(filters.minIntensity),
    maxIntensity: numOrNull(filters.maxIntensity),
    minAverageNPS: numOrNull(filters.minAverageNPS),
    maxAverageNPS: numOrNull(filters.maxAverageNPS),
    minMaxNPS: numOrNull(filters.minMaxNPS),
    maxMaxNPS: numOrNull(filters.maxMaxNPS),
    minYear: numOrNull(filters.minYear),
    maxYear: numOrNull(filters.maxYear),
    modifiedAfter: filters.modifiedAfter || null,
    hash: filters.hash,
    trackHash: filters.trackHash,
    hasSoloSections: filters.hasSoloSections,
    hasForcedNotes: filters.hasForcedNotes,
    hasOpenNotes: filters.hasOpenNotes,
    hasTapNotes: filters.hasTapNotes,
    hasLyrics: filters.hasLyrics,
    hasVocals: filters.hasVocals,
    hasRollLanes: filters.hasRollLanes,
    has2xKick: filters.has2xKick,
    hasIssues: filters.hasIssues,
    hasVideoBackground: filters.hasVideoBackground,
    modchart: filters.modchart,
    page,
    per_page: 25,
  };
}

export default function BrowseCharts() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [instrument, setInstrument] = useState<string>('__all__');
  const [difficulty, setDifficulty] = useState<string>('__all__');
  const [drumType, setDrumType] = useState<string>('__all__');
  const [results, setResults] = useState<ChartResponseEncore[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedChart, setSelectedChart] = useState<ChartResponseEncore | null>(null);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [localChartKeys, setLocalChartKeys] = useState<Set<string>>(new Set());

  // Advanced search state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvancedFilters>(defaultAdvancedFilters);
  const [isAdvancedSearch, setIsAdvancedSearch] = useState(false);
  const lastAdvPayloadRef = useRef<ReturnType<typeof buildAdvancedPayload> | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);

  // Load local chart keys for "in library" detection
  useEffect(() => {
    (async () => {
      try {
        const db = await getLocalDb();
        const rows = await db
          .selectFrom('local_charts')
          .select(['artist', 'song', 'charter'])
          .execute();
        const keys = new Set(
          rows.map(r => `${(r.artist || '').toLowerCase()}|${(r.song || '').toLowerCase()}|${(r.charter || '').toLowerCase()}`),
        );
        setLocalChartKeys(keys);
      } catch {
        // local charts may not be scanned yet
      }
    })();
  }, []);

  const isInLibrary = useCallback(
    (chart: ChartResponseEncore) => {
      const key = `${(chart.artist || '').toLowerCase()}|${(chart.name || '').toLowerCase()}|${(chart.charter || '').toLowerCase()}`;
      return localChartKeys.has(key);
    },
    [localChartKeys],
  );

  const resolvedInstrument = instrument === '__all__' ? null : instrument;
  const resolvedDifficulty = difficulty === '__all__' ? null : difficulty;
  const resolvedDrumType = drumType === '__all__' ? null : drumType;

  // Basic search
  const doSearch = useCallback(
    async (searchQuery: string, pageNum: number, append: boolean) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) return;
      setLoading(true);
      setHasSearched(true);
      setIsAdvancedSearch(false);
      lastAdvPayloadRef.current = null;
      try {
        const response: EncoreResponse = await searchEncore(trimmed, resolvedInstrument, pageNum);
        if (append) {
          setResults(prev => [...prev, ...response.data]);
        } else {
          setResults(response.data);
          setSelectedChart(null);
        }
        setTotalFound(response.found);
        setPage(pageNum);
      } catch (err: any) {
        toast.error(`Search failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [resolvedInstrument],
  );

  // Advanced search
  const doAdvancedSearch = useCallback(
    async (pageNum: number, append: boolean) => {
      setLoading(true);
      setHasSearched(true);
      setIsAdvancedSearch(true);
      try {
        const payload = buildAdvancedPayload(advFilters, resolvedInstrument, resolvedDifficulty, resolvedDrumType, pageNum);
        lastAdvPayloadRef.current = payload;
        const response: EncoreResponse = await searchAdvanced(payload);
        if (append) {
          setResults(prev => [...prev, ...response.data]);
        } else {
          setResults(response.data);
          setSelectedChart(null);
        }
        setTotalFound(response.found);
        setPage(pageNum);
      } catch (err: any) {
        toast.error(`Advanced search failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    },
    [advFilters, resolvedInstrument, resolvedDifficulty, resolvedDrumType],
  );

  const handleSearch = useCallback(() => {
    if (showAdvanced) {
      doAdvancedSearch(1, false);
    } else {
      doSearch(query, 1, false);
    }
  }, [query, showAdvanced, doSearch, doAdvancedSearch]);

  const handleLoadMore = useCallback(() => {
    if (isAdvancedSearch) {
      doAdvancedSearch(page + 1, true);
    } else {
      doSearch(query, page + 1, true);
    }
  }, [query, page, isAdvancedSearch, doSearch, doAdvancedSearch]);

  const handleDownload = useCallback(
    async (chart: ChartResponseEncore) => {
      const md5 = chart.md5;
      setDownloading(prev => new Set(prev).add(md5));
      try {
        await downloadSong(
          chart.artist,
          chart.name,
          chart.charter,
          chart.file,
          { asSng: true },
        );
        setDownloaded(prev => new Set(prev).add(md5));
        toast.success(`Downloaded: ${chart.name}`);
      } catch (err: any) {
        toast.error(`Download failed: ${err.message}`);
      } finally {
        setDownloading(prev => {
          const next = new Set(prev);
          next.delete(md5);
          return next;
        });
      }
    },
    [],
  );

  const handleResetAdvanced = useCallback(() => {
    setAdvFilters(defaultAdvancedFilters());
  }, []);

  const handleToggleAdvanced = () => setShowAdvanced(v => !v);

  const hasMore = results.length < totalFound;

  const filterSelects = (
    <>
      <Select value={instrument} onValueChange={v => setInstrument(v)}>
        <SelectTrigger className="w-full lg:w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INSTRUMENTS.map(inst => (
            <SelectItem key={inst.value} value={inst.value}>{inst.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={difficulty} onValueChange={v => setDifficulty(v)}>
        <SelectTrigger className="w-full lg:w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DIFFICULTIES.map(d => (
            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {instrument === 'drums' && (
        <Select value={drumType} onValueChange={v => setDrumType(v)}>
          <SelectTrigger className="w-full lg:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DRUM_TYPES.map(dt => (
              <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );

  return (
    <div className="flex h-full gap-0">
      {/* Mobile filter sidebar */}
      {filterOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setFilterOpen(false)} />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-surface-container flex flex-col lg:hidden transition-transform duration-200 ${filterOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)'}}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
          <span className="font-headline font-semibold text-sm">Filters</span>
          <button onClick={() => setFilterOpen(false)} className="p-1 text-on-surface-variant hover:text-on-surface">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filterSelects}
          <Button
            variant={showAdvanced ? 'default' : 'outline'}
            className="w-full"
            onClick={() => { handleToggleAdvanced(); setFilterOpen(false); }}
          >
            Advanced {showAdvanced ? '▲' : '▼'}
          </Button>
          <Button className="w-full" onClick={() => { handleSearch(); setFilterOpen(false); }} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search bar row */}
        <div className="px-6 pt-2 pb-3 max-lg:landscape:pt-1 max-lg:landscape:pb-1 shrink-0">
          <form onSubmit={e => { e.preventDefault(); handleSearch(); }} className="flex gap-2 flex-wrap">
            {!showAdvanced && (
              <Input
                placeholder="Search songs, artists, or charters..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 min-w-[180px]"
              />
            )}
            {/* Desktop: inline selects + Advanced toggle */}
            <div className="hidden lg:contents">
              {filterSelects}
            </div>
            <Button
              type="button"
              variant={showAdvanced ? 'default' : 'outline'}
              onClick={handleToggleAdvanced}
              className="hidden lg:inline-flex"
            >
              Advanced {showAdvanced ? '▲' : '▼'}
            </Button>
            {/* Mobile: filter icon button */}
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className="lg:hidden flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background hover:bg-accent shrink-0"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {/* Search button */}
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Search</span>
            </Button>
          </form>
        </div>

        {/* Advanced search panel */}
        {showAdvanced && (
          <AdvancedSearchPanel
            filters={advFilters}
            onChange={setAdvFilters}
            onSearch={() => doAdvancedSearch(1, false)}
            onReset={handleResetAdvanced}
            loading={loading}
            instrument={instrument}
          />
        )}

        {/* Results info */}
        {hasSearched && !loading && results.length > 0 && (
          <div className="px-4 pb-2 text-sm text-muted-foreground">
            Showing {results.length} of {totalFound.toLocaleString()} results
            {isAdvancedSearch && <Badge variant="outline" className="ml-2 text-[10px]">Advanced</Badge>}
          </div>
        )}

        {/* Results table */}
        <div ref={tableRef} className="flex-1 overflow-y-auto px-4">
          {!hasSearched && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <p className="text-lg font-headline font-medium">Explore the Encore catalog</p>
              <p className="text-sm mt-1">Search for songs, artists, or charters to browse and download charts.</p>
            </div>
          )}

          {hasSearched && results.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p className="text-lg font-headline font-medium">No results found</p>
              <p className="text-sm mt-1">Try a different search term or adjust your filters.</p>
            </div>
          )}

          {results.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Song</TableHead>
                    <TableHead className="w-[25%]">Artist</TableHead>
                    <TableHead className="w-[15%]">Charter</TableHead>
                    <TableHead className="w-[10%]">Instruments</TableHead>
                    <TableHead className="w-[8%]">Length</TableHead>
                    <TableHead className="w-[12%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map(chart => {
                    const inLib = isInLibrary(chart);
                    const isDownloadingThis = downloading.has(chart.md5);
                    const isDownloadedThis = downloaded.has(chart.md5);
                    const isSelected = selectedChart?.md5 === chart.md5;
                    const chartInstruments = preFilterInstruments(chart);

                    return (
                      <TableRow
                        key={chart.md5}
                        className={`cursor-pointer ${isSelected ? 'bg-accent' : ''}`}
                        onClick={() => setSelectedChart(chart)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {chart.name}
                            {inLib && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Installed</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>{chart.artist}</TableCell>
                        <TableCell>{removeStyleTags(chart.charter || '')}</TableCell>
                        <TableCell>
                          <ChartInstruments instruments={chartInstruments} size="sm" />
                        </TableCell>
                        <TableCell>{formatDuration(chart.song_length) ?? '--'}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={isDownloadedThis ? 'secondary' : 'default'}
                            disabled={isDownloadingThis || isDownloadedThis}
                            onClick={e => {
                              e.stopPropagation();
                              handleDownload(chart);
                            }}
                          >
                            {isDownloadingThis ? 'Downloading...' : isDownloadedThis ? 'Downloaded' : 'Download'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {hasMore && (
                <div className="flex justify-center py-4">
                  <Button variant="secondary" onClick={handleLoadMore} disabled={loading}>
                    {loading ? 'Loading...' : 'Load More'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chart sidebar */}
      {selectedChart && (
        <ChartSidebar
          chart={selectedChart}
          inLibrary={isInLibrary(selectedChart)}
          isDownloading={downloading.has(selectedChart.md5)}
          isDownloaded={downloaded.has(selectedChart.md5)}
          onDownload={() => handleDownload(selectedChart)}
          onClose={() => setSelectedChart(null)}
        />
      )}
    </div>
  );
}

// -- Advanced Search Panel --

function AdvancedSearchPanel({
  filters,
  onChange,
  onSearch,
  onReset,
  loading,
  instrument,
}: {
  filters: AdvancedFilters;
  onChange: (f: AdvancedFilters) => void;
  onSearch: () => void;
  onReset: () => void;
  loading: boolean;
  instrument: string;
}) {
  const updateText = (field: keyof AdvancedFilters, key: keyof TextFilter, value: string | boolean) => {
    const current = filters[field] as TextFilter;
    onChange({ ...filters, [field]: { ...current, [key]: value } });
  };

  const updateField = (field: keyof AdvancedFilters, value: string) => {
    onChange({ ...filters, [field]: value });
  };

  const isDrums = instrument === 'drums';
  const isAny = instrument === '__all__';

  return (
    <div className="border-t border-b bg-muted/30 px-4 py-3 space-y-4">
      <div className="flex flex-wrap gap-6">
        {/* Text filters column */}
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-1 items-center text-sm">
            <span className="font-medium text-xs text-muted-foreground">Search by</span>
            <span className="font-medium text-xs text-muted-foreground text-center" title="Only include results that match perfectly (not case sensitive)">Exact</span>
            <span className="font-medium text-xs text-muted-foreground text-center" title="Do not include results that match this">Exclude</span>

            {(['name', 'artist', 'album', 'genre', 'year', 'charter'] as const).map(field => {
              const f = filters[field] as TextFilter;
              return (
                <TextFilterRow
                  key={field}
                  label={field.charAt(0).toUpperCase() + field.slice(1)}
                  value={f.value}
                  exact={f.exact}
                  exclude={f.exclude}
                  onValueChange={v => updateText(field, 'value', v)}
                  onExactChange={v => updateText(field, 'exact', v)}
                  onExcludeChange={v => updateText(field, 'exclude', v)}
                />
              );
            })}
          </div>
        </div>

        {/* Numeric range filters */}
        <div className="space-y-1">
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-1 items-center text-sm">
            <span className="font-medium text-xs text-muted-foreground">Range Filters</span>
            <span className="font-medium text-xs text-muted-foreground text-center">Min</span>
            <span className="font-medium text-xs text-muted-foreground text-center">Max</span>

            <RangeRow label="Length (min)" minVal={filters.minLength} maxVal={filters.maxLength} onMinChange={v => updateField('minLength', v)} onMaxChange={v => updateField('maxLength', v)} />
            <RangeRow label="Intensity" minVal={filters.minIntensity} maxVal={filters.maxIntensity} onMinChange={v => updateField('minIntensity', v)} onMaxChange={v => updateField('maxIntensity', v)} tooltip="Also known as chart difficulty. Typically 0-6." />
            <RangeRow label="Avg NPS" minVal={filters.minAverageNPS} maxVal={filters.maxAverageNPS} onMinChange={v => updateField('minAverageNPS', v)} onMaxChange={v => updateField('maxAverageNPS', v)} />
            <RangeRow label="Max NPS" minVal={filters.minMaxNPS} maxVal={filters.maxMaxNPS} onMinChange={v => updateField('minMaxNPS', v)} onMaxChange={v => updateField('maxMaxNPS', v)} />
            <RangeRow label="Year" minVal={filters.minYear} maxVal={filters.maxYear} onMinChange={v => updateField('minYear', v)} onMaxChange={v => updateField('maxYear', v)} />
          </div>

          {/* Date and hash fields */}
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center text-sm pt-2">
            <span className="text-muted-foreground" title="The date of the last time this chart was modified.">Modified After</span>
            <Input
              type="date"
              className="h-7 text-xs w-[140px]"
              value={filters.modifiedAfter}
              onChange={e => updateField('modifiedAfter', e.target.value)}
            />
            <span className="text-muted-foreground" title="The MD5 hash of the chart. Separate multiple with commas.">Hash</span>
            <Input
              className="h-7 text-xs w-[140px]"
              value={filters.hash}
              placeholder="md5..."
              onChange={e => updateField('hash', e.target.value)}
            />
            <span className="text-muted-foreground" title="The hash of things that impact scoring. Separate multiple with commas.">Track Hash</span>
            <Input
              className="h-7 text-xs w-[140px]"
              value={filters.trackHash}
              placeholder="hash..."
              onChange={e => updateField('trackHash', e.target.value)}
            />
          </div>
        </div>

        {/* Boolean toggles */}
        <div className="space-y-1">
          <span className="font-medium text-xs text-muted-foreground block mb-1">Properties</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <TriStateToggle
              label="Solo Sections"
              value={filters.hasSoloSections}
              onChange={v => onChange({ ...filters, hasSoloSections: v })}
            />
            <TriStateToggle
              label="Forced Notes"
              value={filters.hasForcedNotes}
              onChange={v => onChange({ ...filters, hasForcedNotes: v })}
              disabled={isDrums && !isAny}
              disabledReason="Not available for drums"
            />
            <TriStateToggle
              label="Open Notes"
              value={filters.hasOpenNotes}
              onChange={v => onChange({ ...filters, hasOpenNotes: v })}
              disabled={isDrums && !isAny}
              disabledReason="Not available for drums"
            />
            <TriStateToggle
              label="Tap Notes"
              value={filters.hasTapNotes}
              onChange={v => onChange({ ...filters, hasTapNotes: v })}
              disabled={isDrums && !isAny}
              disabledReason="Not available for drums"
            />
            <TriStateToggle
              label="Lyrics"
              value={filters.hasLyrics}
              onChange={v => onChange({ ...filters, hasLyrics: v })}
            />
            <TriStateToggle
              label="Vocals"
              value={filters.hasVocals}
              onChange={v => onChange({ ...filters, hasVocals: v })}
            />
            <TriStateToggle
              label="Roll Lanes"
              value={filters.hasRollLanes}
              onChange={v => onChange({ ...filters, hasRollLanes: v })}
              disabled={!isDrums && !isAny}
              disabledReason="Only available for drums"
            />
            <TriStateToggle
              label="2x Kick"
              value={filters.has2xKick}
              onChange={v => onChange({ ...filters, has2xKick: v })}
              disabled={!isDrums && !isAny}
              disabledReason="Only available for drums"
            />
            <TriStateToggle
              label="Chart Issues"
              value={filters.hasIssues}
              onChange={v => onChange({ ...filters, hasIssues: v })}
            />
            <TriStateToggle
              label="Video Background"
              value={filters.hasVideoBackground}
              onChange={v => onChange({ ...filters, hasVideoBackground: v })}
            />
            <TriStateToggle
              label="Modchart"
              value={filters.modchart}
              onChange={v => onChange({ ...filters, modchart: v })}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onReset}>
          Reset
        </Button>
        <Button size="sm" onClick={onSearch} disabled={loading}>
          {loading ? 'Searching...' : 'Advanced Search'}
        </Button>
      </div>
    </div>
  );
}

// -- Sub-components for the advanced panel --

function TextFilterRow({
  label,
  value,
  exact,
  exclude,
  onValueChange,
  onExactChange,
  onExcludeChange,
}: {
  label: string;
  value: string;
  exact: boolean;
  exclude: boolean;
  onValueChange: (v: string) => void;
  onExactChange: (v: boolean) => void;
  onExcludeChange: (v: boolean) => void;
}) {
  const hasValue = value.length > 0;
  return (
    <>
      <Input
        placeholder={label}
        className="h-7 text-xs w-[160px]"
        value={value}
        onChange={e => onValueChange(e.target.value)}
      />
      <div className="flex justify-center">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary-container rounded"
          checked={exact}
          disabled={!hasValue}
          onChange={e => onExactChange(e.target.checked)}
          title="Exact match (not case sensitive)"
        />
      </div>
      <div className="flex justify-center">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary-container rounded"
          checked={exclude}
          disabled={!hasValue}
          onChange={e => onExcludeChange(e.target.checked)}
          title="Exclude results matching this"
        />
      </div>
    </>
  );
}

function RangeRow({
  label,
  minVal,
  maxVal,
  onMinChange,
  onMaxChange,
  tooltip,
}: {
  label: string;
  minVal: string;
  maxVal: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  tooltip?: string;
}) {
  return (
    <>
      <span className="text-muted-foreground" title={tooltip}>
        {label}
      </span>
      <Input
        type="number"
        placeholder="Min"
        className="h-7 text-xs w-[70px]"
        value={minVal}
        onChange={e => onMinChange(e.target.value)}
      />
      <Input
        type="number"
        placeholder="Max"
        className="h-7 text-xs w-[70px]"
        value={maxVal}
        onChange={e => onMaxChange(e.target.value)}
      />
    </>
  );
}

function TriStateToggle({
  label,
  value,
  onChange,
  disabled,
  disabledReason,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  // Cycle: null (any) -> true (required) -> false (excluded) -> null
  const handleClick = () => {
    if (disabled) return;
    if (value === null) onChange(true);
    else if (value === true) onChange(false);
    else onChange(null);
  };

  const displayLabel =
    value === false ? `No ${label}` : label;

  const stateIndicator =
    value === null ? 'bg-surface-container-highest' :
    value === true ? 'bg-green-500' :
    'bg-red-400';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? disabledReason : `Click to toggle: Any / Required / Excluded`}
      className={`flex items-center gap-1.5 py-0.5 text-xs rounded text-left ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'
      } ${value === null ? 'text-muted-foreground' : ''}`}
    >
      <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${stateIndicator}`} />
      {displayLabel}
    </button>
  );
}

// -- Chart Sidebar --

function ChartSidebar({
  chart,
  inLibrary,
  isDownloading,
  isDownloaded,
  onDownload,
  onClose,
}: {
  chart: ChartResponseEncore;
  inLibrary: boolean;
  isDownloading: boolean;
  isDownloaded: boolean;
  onDownload: () => void;
  onClose: () => void;
}) {
  const instruments = preFilterInstruments(chart);
  const albumArtUrl = chart.albumArtMd5
    ? `https://files.enchor.us/${chart.albumArtMd5}.jpg`
    : null;

  return (
    <div className="w-[340px] border-l flex flex-col overflow-y-auto bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-headline font-semibold text-sm truncate">Chart Details</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div className="p-4 flex justify-center">
        {albumArtUrl ? (
          <img
            src={albumArtUrl}
            alt="Album art"
            className="w-48 h-48 object-cover rounded-lg shadow-md"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-48 h-48 rounded-lg bg-muted flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground opacity-40"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
        )}
      </div>

      <div className="px-4 space-y-1">
        <h2 className="font-headline font-bold text-lg leading-tight">{chart.name}</h2>
        <p className="text-muted-foreground">{chart.artist}</p>
        <p className="text-sm text-muted-foreground">
          Charted by {removeStyleTags(chart.charter || 'Unknown')}
        </p>
      </div>

      <div className="px-4 pt-3 flex flex-wrap gap-1.5">
        {inLibrary && <Badge variant="secondary">In Library</Badge>}
        {chart.hasVideoBackground && <Badge variant="outline">Video BG</Badge>}
      </div>

      <div className="px-4 pt-4 space-y-3 text-sm">
        <DetailRow label="Length" value={formatDuration(chart.song_length) ?? '--'} />
        <DetailRow label="Modified" value={chart.modifiedTime ? new Date(chart.modifiedTime).toLocaleDateString() : '--'} />

        <div>
          <span className="text-muted-foreground text-xs uppercase tracking-wider">Instruments</span>
          <div className="mt-1">
            <ChartInstruments instruments={instruments} size="md" />
          </div>
        </div>

        <div>
          <span className="text-muted-foreground text-xs uppercase tracking-wider">Difficulty</span>
          <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
            {chart.diff_guitar != null && chart.diff_guitar >= 0 && (
              <DiffBadge instrument="Guitar" diff={chart.diff_guitar} />
            )}
            {chart.diff_bass != null && chart.diff_bass >= 0 && (
              <DiffBadge instrument="Bass" diff={chart.diff_bass} />
            )}
            {chart.diff_drums != null && chart.diff_drums >= 0 && (
              <DiffBadge instrument="Drums" diff={chart.diff_drums} />
            )}
            {chart.diff_keys != null && chart.diff_keys >= 0 && (
              <DiffBadge instrument="Keys" diff={chart.diff_keys} />
            )}
            {chart.diff_drums_real != null && chart.diff_drums_real >= 0 && (
              <DiffBadge instrument="Pro Drums" diff={chart.diff_drums_real} />
            )}
          </div>
        </div>
      </div>

      <div className="p-4 mt-auto border-t">
        <Button
          className="w-full"
          disabled={isDownloading || isDownloaded}
          onClick={onDownload}
        >
          {isDownloading ? 'Downloading...' : isDownloaded ? 'Downloaded' : inLibrary ? 'Re-download' : 'Download'}
        </Button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function DiffBadge({ instrument, diff }: { instrument: string; diff: number }) {
  return (
    <div className="flex items-center justify-between bg-muted/50 rounded px-2 py-0.5">
      <span className="text-muted-foreground">{instrument}</span>
      <span className="font-medium">{diff}</span>
    </div>
  );
}
