import {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import {invoke} from '@tauri-apps/api/core';
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Toggle} from '@/components/ui/toggle';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {useTabSearch} from '@/hooks/useTabSearch';
import {TAB_SOURCES, getSource, isGpSource, isPdfSource, isTextTabSource, type TabSearchResult} from '@/lib/tab-sources';
import {downloadPsarcBytes, invalidateDtTokenCache} from '@/lib/tab-sources/ignition4';
import IgnitionLoginDialog from '@/components/IgnitionLoginDialog';
import {saveComposition, markCompositionSaved} from '@/lib/local-db/tab-compositions';
import {exportToGp7} from '@/lib/tab-editor/exporters';
import {importFromAsciiTab} from '@/lib/tab-editor/asciiTabImporter';
import {convertToAlphaTab} from '@/lib/rocksmith/convertToAlphaTab';
import {getSavedCharts, linkChartTabUrl, type SavedChartEntry} from '@/lib/local-db/saved-charts';
import {upsertPdfLibraryEntry, linkChartPdf} from '@/lib/local-db/pdf-library';
import {storeGet, STORE_KEYS} from '@/lib/store';
import {writeFile} from '@tauri-apps/plugin-fs';
import {join, appCacheDir} from '@tauri-apps/api/path';
import type {RocksmithArrangement} from '@/lib/rocksmith/types';
import {toast} from 'sonner';
import {Search, BookOpen, Loader2, ExternalLink, Library, FileText, Music2, AlignLeft, Download, Settings2, MoreVertical, SlidersHorizontal, X} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {isMobileDevice} from '@/lib/platform';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

type BrowseTabCache = {
  query: string;
  enabledSourceIds: Set<string>;
  filterGp: boolean;
  filterPdf: boolean;
  filterInLibrary: boolean;
};

const AVAILABLE_SOURCES = isMobileDevice
  ? TAB_SOURCES.filter(s => s.sourceId !== 'ignition4')
  : TAB_SOURCES;

let _browseTabStateCache: BrowseTabCache = {
  query: '',
  enabledSourceIds: new Set(AVAILABLE_SOURCES.map(s => s.sourceId)),
  filterGp: false,
  filterPdf: false,
  filterInLibrary: false,
};

export default function TabsBrowseTab() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState(_browseTabStateCache.query);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [showIgnitionLogin, setShowIgnitionLogin] = useState(false);
  const [savedCharts, setSavedCharts] = useState<SavedChartEntry[]>([]);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [enabledSourceIds, setEnabledSourceIds] = useState<Set<string>>(
    () => new Set(_browseTabStateCache.enabledSourceIds),
  );

  const enabledSources = useMemo(
    () => AVAILABLE_SOURCES.filter(s => enabledSourceIds.has(s.sourceId)),
    [enabledSourceIds],
  );

  function toggleSource(id: string) {
    if (id === 'ignition4' && !enabledSourceIds.has(id)) {
      // Show login dialog; onSuccess enables the source.
      setShowIgnitionLogin(true);
      return;
    }
    setEnabledSourceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllSources() {
    setEnabledSourceIds(new Set(AVAILABLE_SOURCES.map(s => s.sourceId)));
  }

  function clearAllSources() {
    setEnabledSourceIds(new Set());
  }

  const [filterGp, setFilterGp] = useState(_browseTabStateCache.filterGp);
  const [filterPdf, setFilterPdf] = useState(_browseTabStateCache.filterPdf);
  const [filterInLibrary, setFilterInLibrary] = useState(_browseTabStateCache.filterInLibrary);

  // Persist state to module-level cache on every change
  useEffect(() => {
    _browseTabStateCache = {query, enabledSourceIds, filterGp, filterPdf, filterInLibrary};
  }, [query, enabledSourceIds, filterGp, filterPdf, filterInLibrary]);

  const {results, loading, error, search} = useTabSearch(enabledSources);

  useEffect(() => {
    getSavedCharts().then(setSavedCharts).catch(() => {});
  }, []);

  const findMatchingSavedChart = useCallback(
    (result: TabSearchResult): SavedChartEntry | undefined => {
      const ra = normalize(result.artist);
      const rt = normalize(result.title);
      return savedCharts.find(
        c => normalize(c.artist) === ra && normalize(c.name) === rt,
      );
    },
    [savedCharts],
  );

  const filteredResults = useMemo(() => {
    let r = results;
    if (filterGp) r = r.filter(x => x.hasGp);
    if (filterPdf) r = r.filter(x => x.hasPdf);
    if (filterInLibrary) r = r.filter(x => !!findMatchingSavedChart(x));
    return r;
  }, [results, filterGp, filterPdf, filterInLibrary, findMatchingSavedChart]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    search(query);
  }

  async function openInBrowser(url: string) {
    const {openUrl} = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  }

  async function withAction(key: string, errorPrefix: string, fn: () => Promise<void>) {
    setActionLoadingId(key);
    try {
      await fn();
    } catch (err) {
      toast.error(`${errorPrefix}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function fetchGpBytes(result: TabSearchResult): Promise<ArrayBuffer> {
    const source = getSource(result.sourceId);
    if (!source || !isGpSource(source)) throw new Error('No GP download available for this source');
    const url = await source.getDownloadUrl(result);
    const response = await tauriFetch(url, source.downloadHeaders ? {headers: source.downloadHeaders} : undefined);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return response.arrayBuffer();
  }

  async function saveAndOpen(bytes: ArrayBuffer, result: TabSearchResult) {
    const id = await saveComposition(bytes, {
      title: result.title,
      artist: result.artist,
      album: '',
      tempo: 120,
      instrument: 'guitar',
    });
    const match = findMatchingSavedChart(result);
    if (match && result.viewUrl) {
      await linkChartTabUrl(match.md5, result.viewUrl);
      setSavedCharts(prev =>
        prev.map(c => c.md5 === match.md5 ? {...c, tabUrl: result.viewUrl ?? null} : c),
      );
      toast.success(`Tab linked to saved chart: ${match.name}`);
    }
    navigate(`/tab-editor/${id}`);
  }

  async function handleOpenInEditor(result: TabSearchResult) {
    await withAction(`open-${result.sourceId}-${result.id}`, 'Failed to open tab', async () => {
      const bytes = await fetchGpBytes(result);
      await saveAndOpen(bytes, result);
    });
  }

  async function handleOpenTextTab(result: TabSearchResult) {
    await withAction(`text-${result.sourceId}-${result.id}`, 'Failed to open tab', async () => {
      const source = getSource(result.sourceId);
      let text: string;
      if (source && isTextTabSource(source)) {
        text = await source.getTextContent(result);
      } else {
        const url = result.textTabUrl ?? result.viewUrl;
        if (!url) throw new Error('No URL to fetch tab from');
        const res = await tauriFetch(url);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        text = await res.text();
      }
      const score = importFromAsciiTab(text, {title: result.title, artist: result.artist});
      const gpBytes = exportToGp7(score);
      await saveAndOpen(gpBytes.buffer as ArrayBuffer, result);
    });
  }

  async function handleSaveFile(result: TabSearchResult) {
    await withAction(`save-${result.sourceId}-${result.id}`, 'Failed to save tab', async () => {
      const bytes = await fetchGpBytes(result);
      const id = await saveComposition(bytes, {
        title: result.title,
        artist: result.artist,
        album: '',
        tempo: 120,
        instrument: 'guitar',
      });
      await markCompositionSaved(id);
      const match = findMatchingSavedChart(result);
      if (match && result.viewUrl) {
        await linkChartTabUrl(match.md5, result.viewUrl);
        setSavedCharts(prev =>
          prev.map(c => c.md5 === match.md5 ? {...c, tabUrl: result.viewUrl ?? null} : c),
        );
        toast.success(`Saved to library & linked to "${match.name}"`);
      } else {
        toast.success(`Saved "${result.title}" to library`);
      }
    });
  }

  async function handleSavePdf(result: TabSearchResult) {
    await withAction(`pdf-${result.sourceId}-${result.id}`, 'Failed to save PDF', async () => {
      const source = getSource(result.sourceId);
      if (!source || !isPdfSource(source)) throw new Error('PDF not supported for this source');
      const url = await source.getPdfUrl(result);
      const response = await tauriFetch(url, source.downloadHeaders ? {headers: source.downloadHeaders} : undefined);
      if (!response.ok) throw new Error(`PDF download failed: ${response.status}`);
      const bytes = await response.arrayBuffer();
      const filename = `${result.artist} - ${result.title}.pdf`
        .replace(/[/\\?%*:|"<>]/g, '_');

      const libraryPath = await storeGet<string>(STORE_KEYS.PDF_LIBRARY_PATH);
      if (libraryPath) {
        const absPath = await join(libraryPath, filename);
        await writeFile(absPath, new Uint8Array(bytes));
        const pdfId = await upsertPdfLibraryEntry({
          filename,
          relativePath: filename,
          fileSizeBytes: bytes.byteLength,
          detectedTitle: result.title,
          detectedArtist: result.artist,
          addedAt: new Date().toISOString(),
        });
        const savedMatch = findMatchingSavedChart(result);
        if (savedMatch) {
          await linkChartPdf(savedMatch.md5, pdfId, null, true);
          toast.success(`Saved to PDF Library & linked to "${savedMatch.name}"`);
        } else {
          toast.success(`Saved "${filename}" to PDF Library`);
        }
      } else {
        const blob = new Blob([bytes], {type: 'application/pdf'});
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objectUrl);
        toast.success(`Saved ${filename}`);
      }
    });
  }

  async function handleSavePsarc(result: TabSearchResult) {
    await withAction(`psarc-${result.sourceId}-${result.id}`, 'Failed to download PSARC', async () => {
      const bytes = await downloadPsarcBytes(Number(result.id));
      const filename = `${result.artist} - ${result.title}.psarc`
        .replace(/[/\\?%*:|"<>]/g, '_');

      const psarcPath = await storeGet<string>(STORE_KEYS.CUSTOMSFORGE_PSARC_PATH);
      if (psarcPath) {
        const absPath = await join(psarcPath, filename);
        await writeFile(absPath, new Uint8Array(bytes));
        toast.success(`Saved "${filename}" to PSARC folder`);
      } else {
        const blob = new Blob([bytes], {type: 'application/octet-stream'});
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objectUrl);
        toast.success(`Downloaded ${filename}`);
      }
    });
  }

  async function handleOpenPsarcInViewer(result: TabSearchResult) {
    await withAction(`psarc-open-${result.sourceId}-${result.id}`, 'Failed to open PSARC', async () => {
      const bytes = await downloadPsarcBytes(Number(result.id));
      const cacheDir = await appCacheDir();
      const tempPath = await join(cacheDir, `ignition-${result.id}.psarc`);
      await writeFile(tempPath, new Uint8Array(bytes));

      const {arrangements} = await invoke<{arrangements: RocksmithArrangement[]}>(
        'parse_psarc',
        {path: tempPath},
      );
      if (arrangements.length === 0) throw new Error('No arrangements found in PSARC');

      // Prefer Lead, fall back to first arrangement.
      const arr = arrangements.find(a => a.arrangementType === 'Lead') ?? arrangements[0];
      const instrument = arr.arrangementType === 'Bass' ? 'bass' : 'guitar';

      const score = convertToAlphaTab(arr);
      const gp7Bytes = exportToGp7(score);

      const id = await saveComposition(gp7Bytes.buffer as ArrayBuffer, {
        title: result.title,
        artist: result.artist,
        album: '',
        tempo: Math.round(arr.averageTempo ?? 120),
        instrument,
      });

      navigate(`/tab-editor/${id}`);
    });
  }

  const sourceName = (sourceId: string) => getSource(sourceId)?.name ?? sourceId;

  return (
    <>
    <IgnitionLoginDialog
      open={showIgnitionLogin}
      onOpenChange={setShowIgnitionLogin}
      onSuccess={() => {
        invalidateDtTokenCache();
        setEnabledSourceIds(prev => new Set([...prev, 'ignition4']));
      }}
    />

    {/* Mobile filter sidebar */}
    {filterOpen && (
      <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setFilterOpen(false)} />
    )}
    <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-surface-container flex flex-col lg:hidden transition-transform duration-200 ${filterOpen ? 'translate-x-0' : '-translate-x-full'}`}
      style={{paddingTop: 'var(--sat)', paddingBottom: 'var(--sab)'}}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
        <span className="font-headline font-semibold text-sm">Filters</span>
        <button onClick={() => setFilterOpen(false)} className="p-1 text-on-surface-variant hover:text-on-surface">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Sources */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-on-surface-variant/60 text-xs uppercase tracking-wide">Sources</span>
            <button onClick={selectAllSources} className="text-xs text-primary/70 hover:text-primary transition-colors">All</button>
            <span className="text-outline/40 text-xs">·</span>
            <button onClick={clearAllSources} className="text-xs text-primary/70 hover:text-primary transition-colors">None</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_SOURCES.map(source => (
              <div key={source.sourceId} className="flex items-center">
                <Toggle size="sm" pressed={enabledSourceIds.has(source.sourceId)} onPressedChange={() => toggleSource(source.sourceId)} className="h-7 px-2.5 text-xs">
                  {source.name}
                </Toggle>
                {source.sourceId === 'ignition4' && (
                  <button onClick={() => setShowIgnitionLogin(true)} className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors" title="Update CustomsForge session">
                    <Settings2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Format */}
        <div className="space-y-2">
          <span className="text-on-surface-variant/60 text-xs uppercase tracking-wide block">Format</span>
          <div className="flex flex-wrap gap-1.5">
            <Toggle size="sm" pressed={filterGp} onPressedChange={setFilterGp} className="h-7 px-2.5 text-xs gap-1"><Music2 className="h-3 w-3" />GP</Toggle>
            <Toggle size="sm" pressed={filterPdf} onPressedChange={setFilterPdf} className="h-7 px-2.5 text-xs gap-1"><FileText className="h-3 w-3" />PDF</Toggle>
            <Toggle size="sm" pressed={filterInLibrary} onPressedChange={setFilterInLibrary} className="h-7 px-2.5 text-xs gap-1"><Library className="h-3 w-3" />In Library</Toggle>
          </div>
        </div>
      </div>
    </div>

    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 pt-2 pb-3 max-lg:landscape:pt-1 max-lg:landscape:pb-1 shrink-0 space-y-3 max-lg:landscape:space-y-1.5">
          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-2 max-w-xl">
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by song or artist…"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className="lg:hidden flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background hover:bg-accent shrink-0"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">Search</span>
            </Button>
          </form>

          {/* Desktop filter toolbar */}
          <div className="hidden lg:flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-on-surface-variant/60 text-xs uppercase tracking-wide">Sources</span>
              <button onClick={selectAllSources} className="text-xs text-primary/70 hover:text-primary transition-colors leading-none">All</button>
              <span className="text-outline/40 text-xs leading-none">·</span>
              <button onClick={clearAllSources} className="text-xs text-primary/70 hover:text-primary transition-colors leading-none">None</button>
              {AVAILABLE_SOURCES.map(source => (
                <div key={source.sourceId} className="flex items-center">
                  <Toggle size="sm" pressed={enabledSourceIds.has(source.sourceId)} onPressedChange={() => toggleSource(source.sourceId)} className="h-7 px-2.5 text-xs">
                    {source.name}
                  </Toggle>
                  {source.sourceId === 'ignition4' && (
                    <button onClick={() => setShowIgnitionLogin(true)} className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors" title="Update CustomsForge session">
                      <Settings2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-on-surface-variant/60 text-xs uppercase tracking-wide">Format</span>
              <Toggle size="sm" pressed={filterGp} onPressedChange={setFilterGp} className="h-7 px-2.5 text-xs gap-1"><Music2 className="h-3 w-3" />GP</Toggle>
              <Toggle size="sm" pressed={filterPdf} onPressedChange={setFilterPdf} className="h-7 px-2.5 text-xs gap-1"><FileText className="h-3 w-3" />PDF</Toggle>
            </div>
            <div className="w-px h-4 bg-border" />
            <Toggle size="sm" pressed={filterInLibrary} onPressedChange={setFilterInLibrary} className="h-7 px-2.5 text-xs gap-1"><Library className="h-3 w-3" />In Library</Toggle>
            {results.length > 0 && (
              <span className="ml-auto text-xs text-on-surface-variant/50">
                {filteredResults.length === results.length
                  ? `${results.length} results`
                  : `${filteredResults.length} of ${results.length}`}
              </span>
            )}
          </div>

          {/* Mobile: result count */}
          {results.length > 0 && (
            <div className="lg:hidden text-xs text-on-surface-variant/50">
              {filteredResults.length === results.length
                ? `${results.length} results`
                : `${filteredResults.length} of ${results.length}`}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          {filteredResults.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-48 text-on-surface-variant/50 gap-2">
              <BookOpen className="h-8 w-8" />
              <p className="text-sm">
                {results.length > 0
                  ? 'No results match the active filters'
                  : 'Search for a song to find tabs'}
              </p>
            </div>
          )}

          {filteredResults.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden lg:table-cell">Artist</TableHead>
                  <TableHead className="hidden lg:table-cell">Source</TableHead>
                  <TableHead className="text-right w-10 lg:w-auto"><span className="hidden lg:inline">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.map(result => {
                  const rowKey = `${result.sourceId}-${result.id}`;
                  const isOpenLoading = actionLoadingId === `open-${rowKey}`;
                  const isSaveLoading = actionLoadingId === `save-${rowKey}`;
                  const isPdfLoading = actionLoadingId === `pdf-${rowKey}`;
                  const isTextLoading = actionLoadingId === `text-${rowKey}`;
                  const isPsarcLoading = actionLoadingId === `psarc-${rowKey}`;
                  const isPsarcOpenLoading = actionLoadingId === `psarc-open-${rowKey}`;
                  const isAnyLoading = isOpenLoading || isSaveLoading || isPdfLoading || isTextLoading || isPsarcLoading || isPsarcOpenLoading;
                  const savedMatch = findMatchingSavedChart(result);
                  return (
                    <TableRow key={rowKey}>
                      <TableCell className="font-medium">
                        <div>{result.title}</div>
                        <div className="lg:hidden flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-on-surface-variant">{result.artist}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{sourceName(result.sourceId)}</Badge>
                          {savedMatch && <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0"><Library className="h-2.5 w-2.5" />Library</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-on-surface-variant">{result.artist}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex gap-1.5 flex-wrap">
                          <Badge variant="secondary">{sourceName(result.sourceId)}</Badge>
                          {savedMatch && (
                            <Badge variant="outline" className="gap-1">
                              <Library className="h-3 w-3" />
                              In Library
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Desktop: full action buttons */}
                        <div className="hidden lg:flex gap-2 justify-end">
                          {result.viewUrl && (
                            <Button size="sm" variant="outline" disabled={isAnyLoading} onClick={() => openInBrowser(result.viewUrl!)}>
                              <ExternalLink className="h-3 w-3" /><span className="ml-1.5">View</span>
                            </Button>
                          )}
                          {result.textTabUrl && !result.hasGp && (
                            <Button size="sm" variant="outline" disabled={isAnyLoading} onClick={() => handleOpenTextTab(result)}>
                              {isTextLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlignLeft className="h-3 w-3" />}
                              <span className="ml-1.5">Open</span>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" disabled={isAnyLoading || !result.hasGp} onClick={() => handleOpenInEditor(result)}>
                            {isOpenLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3 w-3" />}
                            <span className="ml-1.5">Open</span>
                          </Button>
                          <Button size="sm" variant="outline" disabled={isAnyLoading || !result.hasGp} onClick={() => handleSaveFile(result)}>
                            {isSaveLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Library className="h-3 w-3" />}
                            <span className="ml-1.5">Save GP</span>
                          </Button>
                          {result.hasPdf && (
                            <Button size="sm" variant="outline" disabled={isAnyLoading} onClick={() => handleSavePdf(result)}>
                              {isPdfLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                              <span className="ml-1.5">PDF</span>
                            </Button>
                          )}
                          {result.hasPsarc && (
                            <>
                              <Button size="sm" variant="outline" disabled={isAnyLoading} onClick={() => handleOpenPsarcInViewer(result)}>
                                {isPsarcOpenLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Music2 className="h-3 w-3" />}
                                <span className="ml-1.5">Open</span>
                              </Button>
                              <Button size="sm" variant="outline" disabled={isAnyLoading} onClick={() => handleSavePsarc(result)}>
                                {isPsarcLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                <span className="ml-1.5">PSARC</span>
                              </Button>
                            </>
                          )}
                        </div>

                        {/* Mobile: single ⋮ dropdown */}
                        <div className="lg:hidden flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={isAnyLoading}>
                                {isAnyLoading
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <MoreVertical className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {result.viewUrl && (
                                <DropdownMenuItem onClick={() => openInBrowser(result.viewUrl!)}>
                                  <ExternalLink className="h-4 w-4 mr-2" />View online
                                </DropdownMenuItem>
                              )}
                              {result.textTabUrl && !result.hasGp && (
                                <DropdownMenuItem onClick={() => handleOpenTextTab(result)}>
                                  <AlignLeft className="h-4 w-4 mr-2" />Open ASCII tab
                                </DropdownMenuItem>
                              )}
                              {result.hasGp && (
                                <DropdownMenuItem onClick={() => handleOpenInEditor(result)}>
                                  <BookOpen className="h-4 w-4 mr-2" />Open in editor
                                </DropdownMenuItem>
                              )}
                              {result.hasGp && (
                                <DropdownMenuItem onClick={() => handleSaveFile(result)}>
                                  <Library className="h-4 w-4 mr-2" />Save GP to library
                                </DropdownMenuItem>
                              )}
                              {result.hasPdf && (
                                <DropdownMenuItem onClick={() => handleSavePdf(result)}>
                                  <FileText className="h-4 w-4 mr-2" />Save PDF
                                </DropdownMenuItem>
                              )}
                              {result.hasPsarc && (
                                <>
                                  <DropdownMenuItem onClick={() => handleOpenPsarcInViewer(result)}>
                                    <Music2 className="h-4 w-4 mr-2" />Open PSARC
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleSavePsarc(result)}>
                                    <Download className="h-4 w-4 mr-2" />Download PSARC
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

    </TooltipProvider>
    </>
  );
}
