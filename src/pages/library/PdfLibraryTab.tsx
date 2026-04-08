import {useState, useEffect, useCallback} from 'react';
import {open as openDialog} from '@tauri-apps/plugin-dialog';
import {
  Loader2, FolderOpen, RefreshCw, LinkIcon, Unlink, CheckCircle,
  XCircle, FileText, Search, Music2,
} from 'lucide-react';
import {toast} from 'sonner';
import {storeGet, storeSet, STORE_KEYS} from '@/lib/store';
import {scanPdfDirectory} from '@/lib/pdf/scanner';
import {
  findMatchSuggestions,
  FilenameSimilarityStrategy,
  FolderNameStrategy,
  type PdfMatchSuggestion,
} from '@/lib/pdf/matcher';
import {
  getPdfLibraryEntriesWithLinkStatus,
  upsertPdfLibraryEntry,
  linkChartPdf,
  unlinkChartPdf,
  type PdfLibraryEntry,
} from '@/lib/local-db/pdf-library';
import {getSavedCharts, type SavedChartEntry} from '@/lib/local-db/saved-charts';

type EntryWithLinks = PdfLibraryEntry & {linkedChartMd5s: string[]};

export default function PdfLibraryTab() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryWithLinks[]>([]);
  const [savedCharts, setSavedCharts] = useState<SavedChartEntry[]>([]);
  const [suggestions, setSuggestions] = useState<PdfMatchSuggestion[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'linked' | 'unmatched'>('all');

  const load = useCallback(async () => {
    const [path, entriesWithStatus, charts, scanTime] = await Promise.all([
      storeGet<string>(STORE_KEYS.PDF_LIBRARY_PATH),
      getPdfLibraryEntriesWithLinkStatus(),
      getSavedCharts(),
      storeGet<string>(STORE_KEYS.PDF_LIBRARY_LAST_SCAN),
    ]);
    setLibraryPath(path);
    setEntries(entriesWithStatus);
    setSavedCharts(charts);
    setLastScan(scanTime);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!entries.length || !savedCharts.length) { setSuggestions([]); return; }
    const unlinked = entries.filter(e => e.linkedChartMd5s.length === 0);
    setSuggestions(findMatchSuggestions(unlinked, savedCharts, [
      new FilenameSimilarityStrategy(),
      new FolderNameStrategy(),
    ]));
  }, [entries, savedCharts]);

  const handlePickFolder = async () => {
    const selected = await openDialog({directory: true, title: 'Select PDF Library Folder'});
    if (!selected || typeof selected !== 'string') return;
    await storeSet(STORE_KEYS.PDF_LIBRARY_PATH, selected);
    setLibraryPath(selected);
    await handleScan(selected);
  };

  const handleScan = async (path?: string) => {
    const root = path ?? libraryPath;
    if (!root) { toast.error('No library folder set.'); return; }
    setScanning(true);
    try {
      const scanned = await scanPdfDirectory(root);
      const now = new Date().toISOString();
      for (const pdf of scanned) {
        await upsertPdfLibraryEntry({
          filename: pdf.filename,
          relativePath: pdf.relativePath,
          fileSizeBytes: pdf.fileSizeBytes,
          detectedTitle: pdf.detectedTitle,
          detectedArtist: pdf.detectedArtist,
          addedAt: now,
        });
      }
      await storeSet(STORE_KEYS.PDF_LIBRARY_LAST_SCAN, now);
      toast.success(`Scanned ${scanned.length} PDF${scanned.length !== 1 ? 's' : ''}`);
      await load();
    } catch (err) {
      toast.error('Scan failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setScanning(false);
    }
  };

  const handleConfirmSuggestion = async (s: PdfMatchSuggestion) => {
    await linkChartPdf(s.chart.md5, s.pdf.id, null, true);
    toast.success(`Linked "${s.pdf.filename}" → "${s.chart.name}"`);
    await load();
  };

  const handleManualLink = async (pdfId: number, chartMd5: string) => {
    await linkChartPdf(chartMd5, pdfId, null, true);
    const chart = savedCharts.find(c => c.md5 === chartMd5);
    toast.success(chart ? `Linked to "${chart.name}"` : 'Linked');
    await load();
  };

  const handleUnlink = async (chartMd5: string, pdfLibraryId: number) => {
    await unlinkChartPdf(chartMd5, pdfLibraryId);
    toast.success('Unlinked');
    await load();
  };

  const chartName = (md5: string) =>
    savedCharts.find(c => c.md5 === md5)?.name ?? md5.slice(0, 8) + '…';

  const filtered = entries.filter(e => {
    if (filter === 'linked' && e.linkedChartMd5s.length === 0) return false;
    if (filter === 'unmatched' && e.linkedChartMd5s.length > 0) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.filename.toLowerCase().includes(q) ||
        (e.detectedArtist ?? '').toLowerCase().includes(q) ||
        (e.detectedTitle ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const linkedCount = entries.filter(e => e.linkedChartMd5s.length > 0).length;
  const unmatchedCount = entries.filter(e => e.linkedChartMd5s.length === 0).length;

  return (
    <div className="flex-1 overflow-y-auto bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-secondary" />
            <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
              PDF Library
            </h1>
          </div>
          <p className="text-on-surface-variant text-sm max-w-xl leading-relaxed">
            Point ChartMate at a folder of sheet music PDFs. It will scan recursively and
            auto-match files to your saved charts.
          </p>
        </header>

        {/* Folder config bar */}
        <div className="flex items-center gap-3 flex-wrap p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10">
          <button
            onClick={handlePickFolder}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant
                       hover:bg-surface-variant transition-colors text-sm"
          >
            <FolderOpen className="h-4 w-4" />
            {libraryPath ? 'Change Folder' : 'Set PDF Folder'}
          </button>

          {libraryPath && (
            <button
              onClick={() => handleScan()}
              disabled={scanning}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-on-primary
                         hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm"
            >
              {scanning
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />
              }
              {scanning ? 'Scanning…' : 'Scan Now'}
            </button>
          )}

          <div className="flex-1 min-w-0">
            {libraryPath && (
              <p className="text-xs text-on-surface-variant font-mono truncate">{libraryPath}</p>
            )}
            {lastScan && (
              <p className="text-xs text-outline">
                Last scan: {new Date(lastScan).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="font-headline font-bold text-lg text-on-surface">Suggested Matches</h2>
              <span className="text-xs font-mono text-outline bg-surface-container px-2 py-0.5 rounded-full">
                {suggestions.length}
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              These PDFs look like music files. Confirm or reject each match.
            </p>
            <div className="space-y-1.5">
              {suggestions.map(s => (
                <div
                  key={s.pdf.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-outline-variant/50
                             bg-surface-container-low hover:bg-surface-container transition-colors"
                >
                  <FileText className="h-4 w-4 text-secondary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate font-medium">{s.pdf.filename}</p>
                    <p className="text-xs text-outline truncate">{s.pdf.relativePath}</p>
                  </div>
                  <span className="text-outline text-sm flex-shrink-0">→</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate font-medium text-primary">{s.chart.name}</p>
                    <p className="text-xs text-outline truncate">{s.chart.artist}</p>
                  </div>
                  <span className="text-xs text-outline font-mono flex-shrink-0 w-9 text-right">
                    {Math.round(s.score * 100)}%
                  </span>
                  <button
                    onClick={() => handleConfirmSuggestion(s)}
                    className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors flex-shrink-0"
                    title="Confirm match"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setSuggestions(prev => prev.filter(x => x.pdf.id !== s.pdf.id))}
                    className="p-1.5 rounded-lg hover:bg-error/10 hover:text-error transition-colors flex-shrink-0"
                    title="Dismiss suggestion"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Library list */}
        {entries.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <h2 className="font-headline font-bold text-lg text-on-surface">All PDFs</h2>
                <span className="text-xs font-mono text-outline bg-surface-container px-2 py-0.5 rounded-full">
                  {entries.length}
                </span>
              </div>

              {/* Stats badges */}
              <div className="flex gap-2 text-xs font-mono">
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {linkedCount} linked
                </span>
                <span className="bg-surface-container text-outline px-2 py-0.5 rounded-full">
                  {unmatchedCount} unmatched
                </span>
              </div>
            </div>

            {/* Filter + search row */}
            <div className="flex gap-2 flex-wrap">
              {(['all', 'linked', 'unmatched'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-mono transition-colors capitalize
                    ${filter === f
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-outline hover:bg-surface-variant'
                    }`}
                >
                  {f}
                </button>
              ))}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-outline pointer-events-none" />
                <input
                  type="search"
                  placeholder="Filter by name…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-surface-container-high
                             text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="space-y-1">
              {filtered.length === 0 && (
                <p className="text-sm text-outline py-6 text-center">No PDFs match this filter.</p>
              )}
              {filtered.map(entry => (
                <PdfRow
                  key={entry.id}
                  entry={entry}
                  savedCharts={savedCharts}
                  chartName={chartName}
                  onLink={handleManualLink}
                  onUnlink={handleUnlink}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!libraryPath && (
          <div className="py-20 text-center space-y-3">
            <FileText className="mx-auto h-12 w-12 text-outline opacity-40" />
            <p className="text-on-surface-variant">
              Set a PDF library folder to get started.
            </p>
            <p className="text-xs text-outline max-w-sm mx-auto">
              ChartMate scans the folder recursively for PDFs, then suggests matches
              to your saved charts based on filename similarity.
            </p>
          </div>
        )}

        {libraryPath && entries.length === 0 && !scanning && (
          <div className="py-20 text-center space-y-3">
            <Music2 className="mx-auto h-12 w-12 text-outline opacity-40" />
            <p className="text-on-surface-variant">No PDFs found in this folder.</p>
            <button
              onClick={() => handleScan()}
              className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
            >
              <RefreshCw className="h-4 w-4" /> Scan Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PdfRow ────────────────────────────────────────────────────────────

function PdfRow({
  entry,
  savedCharts,
  chartName,
  onLink,
  onUnlink,
}: {
  entry: EntryWithLinks;
  savedCharts: SavedChartEntry[];
  chartName: (md5: string) => string;
  onLink: (pdfId: number, chartMd5: string) => Promise<void>;
  onUnlink: (chartMd5: string, pdfId: number) => Promise<void>;
}) {
  const [linking, setLinking] = useState(false);
  const [chartSearch, setChartSearch] = useState('');

  const isLinked = entry.linkedChartMd5s.length > 0;

  const filteredCharts = chartSearch
    ? savedCharts.filter(c =>
        c.name.toLowerCase().includes(chartSearch.toLowerCase()) ||
        c.artist.toLowerCase().includes(chartSearch.toLowerCase()),
      )
    : savedCharts.slice(0, 12);

  return (
    <div className="rounded-xl border border-outline-variant/50 bg-surface-container-low overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <FileText className={`h-4 w-4 flex-shrink-0 ${isLinked ? 'text-primary' : 'text-outline'}`} />

        <div className="flex-1 min-w-0">
          <p className="text-sm truncate font-medium text-on-surface">{entry.filename}</p>
          <p className="text-xs text-outline truncate">{entry.relativePath}</p>
        </div>

        {isLinked ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <LinkIcon className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-primary font-medium truncate max-w-[160px]">
              {entry.linkedChartMd5s.map(chartName).join(', ')}
            </span>
            <button
              onClick={() => entry.linkedChartMd5s.forEach(md5 => onUnlink(md5, entry.id))}
              className="p-1 rounded hover:bg-error/10 hover:text-error transition-colors opacity-50 hover:opacity-100"
              title="Unlink"
            >
              <Unlink className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-outline font-mono">unmatched</span>
            <button
              onClick={() => setLinking(p => !p)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors
                ${linking
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant hover:bg-surface-variant text-on-surface-variant'
                }`}
              title="Link to a chart"
            >
              <LinkIcon className="h-3 w-3" />
              Link
            </button>
          </div>
        )}
      </div>

      {/* Manual chart picker (inline dropdown) */}
      {linking && (
        <div className="border-t border-outline-variant/50 p-3 space-y-2 bg-surface-container">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-outline pointer-events-none" />
            <input
              autoFocus
              type="search"
              placeholder="Search saved charts…"
              value={chartSearch}
              onChange={e => setChartSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface-container-high
                         text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filteredCharts.length === 0 && (
              <p className="text-xs text-outline py-2 text-center">No charts found</p>
            )}
            {filteredCharts.map(chart => (
              <button
                key={chart.md5}
                onClick={async () => {
                  await onLink(entry.id, chart.md5);
                  setLinking(false);
                  setChartSearch('');
                }}
                className="w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left
                           hover:bg-primary/10 transition-colors text-xs"
              >
                <Music2 className="h-3.5 w-3.5 text-outline flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium text-on-surface truncate">{chart.name}</p>
                  <p className="text-outline truncate">{chart.artist}</p>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => { setLinking(false); setChartSearch(''); }}
            className="text-xs text-outline hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
