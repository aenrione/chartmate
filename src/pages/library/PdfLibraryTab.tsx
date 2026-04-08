import {useState, useEffect, useCallback} from 'react';
import {open as openDialog} from '@tauri-apps/plugin-dialog';
import {Loader2, FolderOpen, RefreshCw, Link, Unlink, CheckCircle, XCircle, FileText} from 'lucide-react';
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
  getAllPdfLibraryEntries,
  upsertPdfLibraryEntry,
  getPdfLibraryEntriesWithLinkStatus,
  linkChartPdf,
  unlinkChartPdf,
  type PdfLibraryEntry,
} from '@/lib/local-db/pdf-library';
import {getSavedCharts, type SavedChartEntry} from '@/lib/local-db/saved-charts';

export default function PdfLibraryTab() {
  const [libraryPath, setLibraryPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<Array<PdfLibraryEntry & {linkedChartMd5s: string[]}>>([]);
  const [savedCharts, setSavedCharts] = useState<SavedChartEntry[]>([]);
  const [suggestions, setSuggestions] = useState<PdfMatchSuggestion[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, [load]);

  // Compute auto-match suggestions whenever entries or charts change
  useEffect(() => {
    if (!entries.length || !savedCharts.length) {
      setSuggestions([]);
      return;
    }
    const unlinked = entries.filter(e => e.linkedChartMd5s.length === 0);
    const sugg = findMatchSuggestions(unlinked, savedCharts, [
      new FilenameSimilarityStrategy(),
      new FolderNameStrategy(),
    ]);
    setSuggestions(sugg);
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
    if (!root) {
      toast.error('No library folder set.');
      return;
    }
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
      toast.success(`Found ${scanned.length} PDF${scanned.length !== 1 ? 's' : ''}`);
      await load();
    } catch (err) {
      toast.error('Scan failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setScanning(false);
    }
  };

  const handleConfirmSuggestion = async (suggestion: PdfMatchSuggestion) => {
    await linkChartPdf(suggestion.chart.md5, suggestion.pdf.id, null, true);
    toast.success(`Linked "${suggestion.pdf.filename}" → "${suggestion.chart.name}"`);
    await load();
  };

  const handleRejectSuggestion = (pdfId: number) => {
    setSuggestions(prev => prev.filter(s => s.pdf.id !== pdfId));
  };

  const handleUnlink = async (chartMd5: string, pdfLibraryId: number) => {
    await unlinkChartPdf(chartMd5, pdfLibraryId);
    toast.success('Unlinked');
    await load();
  };

  const chartName = (md5: string) =>
    savedCharts.find(c => c.md5 === md5)?.name ?? md5.slice(0, 8) + '…';

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Library path config */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handlePickFolder}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant
                       hover:bg-surface-variant transition-colors text-sm"
          >
            <FolderOpen className="h-4 w-4" />
            {libraryPath ? 'Change Folder' : 'Set PDF Library Folder'}
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
              Scan Now
            </button>
          )}
        </div>
        {libraryPath && (
          <p className="text-xs text-on-surface-variant font-mono truncate max-w-lg">{libraryPath}</p>
        )}
        {lastScan && (
          <p className="text-xs text-outline">
            Last scan: {new Date(lastScan).toLocaleString()}
          </p>
        )}
      </div>

      {/* Auto-match suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Suggested Matches
            <span className="ml-2 text-xs text-outline font-normal">({suggestions.length})</span>
          </h3>
          <div className="space-y-1">
            {suggestions.map(s => (
              <div
                key={s.pdf.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-outline-variant
                           bg-surface-container text-sm"
              >
                <FileText className="h-4 w-4 text-outline flex-shrink-0" />
                <span className="flex-1 truncate text-on-surface-variant text-xs">
                  {s.pdf.filename}
                </span>
                <span className="text-outline">→</span>
                <span className="flex-1 truncate font-medium text-xs">{s.chart.name}</span>
                <span className="text-xs text-outline font-mono w-10 text-right">
                  {Math.round(s.score * 100)}%
                </span>
                <button
                  onClick={() => handleConfirmSuggestion(s)}
                  className="p-1 hover:text-primary transition-colors"
                  title="Confirm match"
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleRejectSuggestion(s.pdf.id)}
                  className="p-1 hover:text-error transition-colors"
                  title="Reject suggestion"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All PDFs */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Library
            <span className="ml-2 text-xs text-outline font-normal">({entries.length} PDFs)</span>
          </h3>
          <div className="space-y-1">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-outline-variant
                           bg-surface-container text-sm"
              >
                <FileText className="h-4 w-4 text-outline flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs">{entry.filename}</p>
                  {(entry.detectedArtist || entry.detectedTitle) && (
                    <p className="text-xs text-outline truncate">
                      {[entry.detectedArtist, entry.detectedTitle].filter(Boolean).join(' — ')}
                    </p>
                  )}
                </div>

                {entry.linkedChartMd5s.length > 0 ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs text-primary truncate max-w-[140px]">
                      {entry.linkedChartMd5s.map(chartName).join(', ')}
                    </span>
                    <button
                      onClick={() =>
                        entry.linkedChartMd5s.forEach(md5 => handleUnlink(md5, entry.id))
                      }
                      className="p-1 hover:text-error transition-colors opacity-50 hover:opacity-100"
                      title="Unlink"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-outline flex-shrink-0">Unmatched</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!libraryPath && (
        <div className="text-sm text-on-surface-variant py-8 text-center">
          Set a PDF library folder to get started. ChartMate will scan it recursively for PDF files
          and suggest matches to your saved charts.
        </div>
      )}

      {libraryPath && entries.length === 0 && !scanning && (
        <div className="text-sm text-on-surface-variant py-8 text-center">
          No PDFs found. Click "Scan Now" to search the folder.
        </div>
      )}
    </div>
  );
}
