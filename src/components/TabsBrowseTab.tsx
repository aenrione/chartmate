import {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Toggle} from '@/components/ui/toggle';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {useTabSearch} from '@/hooks/useTabSearch';
import {TAB_SOURCES, getSource, isGpSource, isPdfSource, isTextTabSource, type TabSearchResult} from '@/lib/tab-sources';
import {downloadPsarcBytes} from '@/lib/tab-sources/ignition4';
import {saveComposition, markCompositionSaved} from '@/lib/local-db/tab-compositions';
import {exportToGp7} from '@/lib/tab-editor/exporters';
import {importFromAsciiTab} from '@/lib/tab-editor/asciiTabImporter';
import {getSavedCharts, linkChartTabUrl, type SavedChartEntry} from '@/lib/local-db/saved-charts';
import {upsertPdfLibraryEntry, linkChartPdf} from '@/lib/local-db/pdf-library';
import {storeGet, STORE_KEYS} from '@/lib/store';
import {writeFile} from '@tauri-apps/plugin-fs';
import {join} from '@tauri-apps/api/path';
import {toast} from 'sonner';
import {Search, BookOpen, Loader2, ExternalLink, Library, FileText, Music2, AlignLeft, Download} from 'lucide-react';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default function TabsBrowseTab() {
  const [query, setQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [savedCharts, setSavedCharts] = useState<SavedChartEntry[]>([]);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [enabledSourceIds, setEnabledSourceIds] = useState<Set<string>>(
    () => new Set(TAB_SOURCES.map(s => s.sourceId)),
  );

  const enabledSources = useMemo(
    () => TAB_SOURCES.filter(s => enabledSourceIds.has(s.sourceId)),
    [enabledSourceIds],
  );

  function toggleSource(id: string) {
    setEnabledSourceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllSources() {
    setEnabledSourceIds(new Set(TAB_SOURCES.map(s => s.sourceId)));
  }

  function clearAllSources() {
    setEnabledSourceIds(new Set());
  }

  const [filterGp, setFilterGp] = useState(false);
  const [filterPdf, setFilterPdf] = useState(false);
  const [filterInLibrary, setFilterInLibrary] = useState(false);

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

  const sourceName = (sourceId: string) => getSource(sourceId)?.name ?? sourceId;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 pt-2 pb-3 shrink-0 space-y-3">
          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex gap-2 max-w-xl">
            <Input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by song or artist…"
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2">Search</span>
            </Button>
          </form>

          {/* Filter toolbar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {/* Source toggles */}
            <div className="flex items-center gap-1.5">
              <span className="text-on-surface-variant/60 text-xs uppercase tracking-wide">Sources</span>
              <button
                onClick={selectAllSources}
                className="text-xs text-primary/70 hover:text-primary transition-colors leading-none"
              >All</button>
              <span className="text-outline/40 text-xs leading-none">·</span>
              <button
                onClick={clearAllSources}
                className="text-xs text-primary/70 hover:text-primary transition-colors leading-none"
              >None</button>
              {TAB_SOURCES.map(source => (
                <Toggle
                  key={source.sourceId}
                  size="sm"
                  pressed={enabledSourceIds.has(source.sourceId)}
                  onPressedChange={() => toggleSource(source.sourceId)}
                  className="h-7 px-2.5 text-xs"
                >
                  {source.name}
                </Toggle>
              ))}
            </div>

            <div className="w-px h-4 bg-border hidden sm:block" />

            {/* Format filters */}
            <div className="flex items-center gap-1.5">
              <span className="text-on-surface-variant/60 text-xs uppercase tracking-wide">Format</span>
              <Toggle
                size="sm"
                pressed={filterGp}
                onPressedChange={setFilterGp}
                className="h-7 px-2.5 text-xs gap-1"
              >
                <Music2 className="h-3 w-3" />
                GP
              </Toggle>
              <Toggle
                size="sm"
                pressed={filterPdf}
                onPressedChange={setFilterPdf}
                className="h-7 px-2.5 text-xs gap-1"
              >
                <FileText className="h-3 w-3" />
                PDF
              </Toggle>
            </div>

            <div className="w-px h-4 bg-border hidden sm:block" />

            {/* Library filter */}
            <Toggle
              size="sm"
              pressed={filterInLibrary}
              onPressedChange={setFilterInLibrary}
              className="h-7 px-2.5 text-xs gap-1"
            >
              <Library className="h-3 w-3" />
              In Library
            </Toggle>

            {/* Result count */}
            {results.length > 0 && (
              <span className="ml-auto text-xs text-on-surface-variant/50">
                {filteredResults.length === results.length
                  ? `${results.length} results`
                  : `${filteredResults.length} of ${results.length}`}
              </span>
            )}
          </div>

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
                  <TableHead>Artist</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                  const isAnyLoading = isOpenLoading || isSaveLoading || isPdfLoading || isTextLoading || isPsarcLoading;
                  const savedMatch = findMatchingSavedChart(result);
                  return (
                    <TableRow key={rowKey}>
                      <TableCell className="font-medium">{result.title}</TableCell>
                      <TableCell className="text-on-surface-variant">{result.artist}</TableCell>
                      <TableCell>
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
                        <div className="flex gap-2 justify-end">
                          {result.viewUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isAnyLoading}
                              onClick={() => openInBrowser(result.viewUrl!)}
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span className="ml-1.5">View</span>
                            </Button>
                          )}
                          {result.textTabUrl && !result.hasGp && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isAnyLoading}
                                  onClick={() => handleOpenTextTab(result)}
                                >
                                  {isTextLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <AlignLeft className="h-3 w-3" />
                                  )}
                                  <span className="ml-1.5">Open</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Import ASCII tab and open in editor</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isAnyLoading || !result.hasGp}
                                  onClick={() => handleOpenInEditor(result)}
                                >
                                  {isOpenLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <BookOpen className="h-3 w-3" />
                                  )}
                                  <span className="ml-1.5">Open</span>
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!result.hasGp && (
                              <TooltipContent>
                                No GP file available for this result
                              </TooltipContent>
                            )}
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isAnyLoading || !result.hasGp}
                                  onClick={() => handleSaveFile(result)}
                                >
                                  {isSaveLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Library className="h-3 w-3" />
                                  )}
                                  <span className="ml-1.5">Save GP</span>
                                </Button>
                              </span>
                            </TooltipTrigger>
                            {!result.hasGp && (
                              <TooltipContent>
                                No GP file available for this result
                              </TooltipContent>
                            )}
                          </Tooltip>
                          {result.hasPdf && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isAnyLoading}
                              onClick={() => handleSavePdf(result)}
                            >
                              {isPdfLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <FileText className="h-3 w-3" />
                              )}
                              <span className="ml-1.5">PDF</span>
                            </Button>
                          )}
                          {result.hasPsarc && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isAnyLoading}
                              onClick={() => handleSavePsarc(result)}
                            >
                              {isPsarcLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              <span className="ml-1.5">PSARC</span>
                            </Button>
                          )}
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
  );
}
