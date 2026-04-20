import {useEffect, useState} from 'react';
import {ChevronLeft, ChevronRight, Loader2, Printer} from 'lucide-react';
import {useWindowPrint} from '@/hooks/usePrint';
import {usePlaybook} from './PlaybookProvider';
import {useChartLoader} from '@/lib/useChartLoader';
import SongView from '@/pages/sheet-music/SongView';
import PdfViewerPage from '@/pages/pdf-viewer/PdfViewerPage';
import CompositionViewer from './CompositionViewer';
import {getPrimaryPdfForChart} from '@/lib/local-db/pdf-library';
import type {ProgressStatus} from '@/lib/local-db/playbook';

export default function ChartViewer() {
  const {
    activeItem,
    loopSectionId,
    sections,
    prevSong,
    nextSong,
    activeIndex,
    items,
    annotations,
    sectionProgress,
    compositionScoreData,
    addSection,
    removeSection,
    setSectionStatus,
    addAnnotation,
    removeAnnotation,
  } = usePlaybook();

  const handlePrint = useWindowPrint();

  const itemType = activeItem?.itemType ?? 'chart';
  const md5 = itemType === 'chart' ? (activeItem?.chartMd5 ?? null) : null;
  const {data, loading, error, status} = useChartLoader(md5);
  const [hasPdf, setHasPdf] = useState(false);

  useEffect(() => {
    if (!md5) {
      setHasPdf(false);
      return;
    }
    let cancelled = false;
    getPrimaryPdfForChart(md5).then(link => {
      if (!cancelled) setHasPdf(link !== null);
    });
    return () => { cancelled = true; };
  }, [md5]);

  if (!activeItem) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-container-lowest text-outline text-sm">
        No item selected
      </div>
    );
  }

  const loopSection =
    loopSectionId !== null ? sections.find(s => s.id === loopSectionId) : null;

  const navButtons = (
    <>
      {activeIndex > 0 && (
        <button
          className="absolute left-0 top-0 bottom-0 w-16 z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
          onClick={prevSong}
        >
          <div className="glass-panel rounded-full p-2">
            <ChevronLeft className="h-5 w-5 text-on-surface-variant" />
          </div>
        </button>
      )}
      {activeIndex < items.length - 1 && (
        <button
          className="absolute right-0 top-0 bottom-0 w-16 z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
          onClick={nextSong}
        >
          <div className="glass-panel rounded-full p-2">
            <ChevronRight className="h-5 w-5 text-on-surface-variant" />
          </div>
        </button>
      )}
    </>
  );

  // ── PDF setlist item (direct, no chart link) ──────────────────────
  if (itemType === 'pdf') {
    return (
      <div className="flex-1 relative bg-surface-container-lowest overflow-hidden flex flex-col min-h-0">
        {navButtons}
        <PdfViewerPage pdfLibraryId={activeItem.pdfLibraryId ?? undefined} />
      </div>
    );
  }

  // ── Tab composition ───────────────────────────────────────────────
  if (itemType === 'composition') {
    return (
      <div className="flex-1 relative bg-surface-container-lowest overflow-hidden flex flex-col min-h-0">
        {navButtons}
        {compositionScoreData ? (
          <CompositionViewer scoreData={compositionScoreData} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
    );
  }

  // ── Chart (Enchor / saved chart) ──────────────────────────────────
  return (
    <div className="flex-1 relative bg-surface-container-lowest overflow-hidden flex flex-col min-h-0">
      {loopSection && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 glass-panel ghost-border rounded-full px-3 py-1 flex items-center gap-2">
          <span className="text-xs font-mono text-on-surface-variant">
            Looping: {loopSection.name}
          </span>
        </div>
      )}

      {navButtons}

      {hasPdf ? (
        <PdfViewerPage
          chartMd5={activeItem.chartMd5 ?? undefined}
          sections={sections}
          annotations={annotations}
          sectionProgress={sectionProgress}
          onAddSection={(name, page, yOffset) => addSection(name, 0, 0, page, yOffset)}
          onRemoveSection={removeSection}
          onSetSectionStatus={(id, s) => setSectionStatus(id, s as ProgressStatus)}
          onAddAnnotation={addAnnotation}
          onRemoveAnnotation={removeAnnotation}
        />
      ) : (
        <>
          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-on-surface-variant font-mono">{status}</p>
            </div>
          )}
          {error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-error">Failed to load chart</p>
              <p className="text-xs text-on-surface-variant max-w-md text-center">{error}</p>
            </div>
          )}
          {data && !loading && !error && (
            <div className="flex-1 flex flex-col min-h-0 relative">
              <div className="absolute top-2 right-2 z-20" data-print-hide>
                <button
                  onClick={handlePrint}
                  className="p-1.5 rounded-lg bg-surface-container-high/80 hover:bg-surface-container-high transition-colors text-on-surface-variant"
                  title="Print / Save as PDF"
                >
                  <Printer className="h-4 w-4" />
                </button>
              </div>
              <SongView
                metadata={data.metadata}
                chart={data.chart}
                audioFiles={data.audioFiles}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
