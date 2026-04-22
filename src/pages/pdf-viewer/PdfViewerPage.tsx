import {useState, useEffect, useCallback} from 'react';
import {join} from '@tauri-apps/api/path';
import {Loader2, AlertCircle, FileX, PanelRight} from 'lucide-react';
import type {PDFPageProxy} from 'pdfjs-dist';
import {storeGet, STORE_KEYS} from '@/lib/store';
import {getPrimaryPdfForChart, getPdfLibraryEntry} from '@/lib/local-db/pdf-library';
import {usePdfViewer} from '@/hooks/usePdfViewer';
import PdfPageCanvas from './PdfPageCanvas';
import PdfControls from './PdfControls';
import PdfSectionPanel from './PdfSectionPanel';
import type {
  SongSection,
  SongAnnotation,
  ProgressStatus,
  SectionProgressRecord,
} from '@/lib/local-db/playbook';

type Props = {
  /** Resolve PDF via chart's primary PDF link. Mutually exclusive with pdfLibraryId. */
  chartMd5?: string;
  /** Resolve PDF directly by pdf_library.id. Mutually exclusive with chartMd5. */
  pdfLibraryId?: number;
  sections?: SongSection[];
  annotations?: SongAnnotation[];
  sectionProgress?: SectionProgressRecord[];
  onAddSection?: (name: string, page: number, yOffset: number) => Promise<void>;
  onRemoveSection?: (id: number) => Promise<void>;
  onSetSectionStatus?: (id: number, status: ProgressStatus) => Promise<void>;
  onAddAnnotation?: (sectionId: number, content: string) => Promise<void>;
  onRemoveAnnotation?: (id: number) => Promise<void>;
};

export default function PdfViewerPage({
  chartMd5,
  pdfLibraryId,
  sections = [],
  annotations = [],
  sectionProgress = [],
  onAddSection,
  onRemoveSection,
  onSetSectionStatus,
  onAddAnnotation,
  onRemoveAnnotation,
}: Props) {
  const [absolutePath, setAbsolutePath] = useState<string | null>(null);
  const [pathLoading, setPathLoading] = useState(true);
  const hasSections = !!onAddSection;
  const [sidebarOpen, setSidebarOpen] = useState(hasSections);
  const [renderedPages, setRenderedPages] = useState<PDFPageProxy[]>([]);

  const viewer = usePdfViewer(absolutePath);

  // Resolve absolute PDF path — either via chart link or direct library entry
  useEffect(() => {
    let cancelled = false;
    setPathLoading(true);

    const resolve = async () => {
      const root = await storeGet<string>(STORE_KEYS.PDF_LIBRARY_PATH);
      if (!root) {
        if (!cancelled) setPathLoading(false);
        return;
      }

      let relativePath: string | null = null;

      if (pdfLibraryId != null) {
        const entry = await getPdfLibraryEntry(pdfLibraryId);
        relativePath = entry?.relativePath ?? null;
      } else if (chartMd5) {
        const link = await getPrimaryPdfForChart(chartMd5);
        relativePath = link?.relativePath ?? null;
      }

      if (!relativePath) {
        if (!cancelled) setPathLoading(false);
        return;
      }

      const abs = await join(root, relativePath);
      if (!cancelled) {
        setAbsolutePath(abs);
        setPathLoading(false);
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [chartMd5, pdfLibraryId]);

  // Load all page proxies when document is ready
  useEffect(() => {
    if (viewer.totalPages === 0) {
      setRenderedPages([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const pages: PDFPageProxy[] = [];
      for (let i = 1; i <= viewer.totalPages; i++) {
        const page = await viewer.getPage(i);
        if (page) pages.push(page);
      }
      if (!cancelled) setRenderedPages(pages);
    };

    load();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer.totalPages]);

  const handleGoToSection = useCallback(
    (section: SongSection) => {
      if (section.pdfPage == null) return;

      if (viewer.scrollMode === 'single') {
        viewer.goToPage(section.pdfPage);
        return;
      }

      const container = viewer.scrollContainerRef.current;
      if (!container) return;
      const pageEls = container.querySelectorAll<HTMLElement>('[data-pdf-page]');
      const target = Array.from(pageEls).find(
        el => Number(el.dataset.pdfPage) === section.pdfPage,
      );
      if (target) {
        const yInPage = (section.pdfYOffset ?? 0) * target.offsetHeight;
        container.scrollTop = target.offsetTop + yInPage;
      }
    },
    [viewer],
  );

  const sectionMarkersForPage = useCallback(
    (pageNum: number) =>
      sections
        .filter(s => s.pdfPage === pageNum)
        .map(s => ({id: s.id, name: s.name, yOffset: s.pdfYOffset ?? 0})),
    [sections],
  );

  if (pathLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-container-lowest">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!absolutePath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-surface-container-lowest text-outline">
        <FileX className="h-10 w-10" />
        <p className="text-sm">No PDF linked to this chart.</p>
        <p className="text-xs">Go to Library → PDFs to link one.</p>
      </div>
    );
  }

  if (viewer.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-surface-container-lowest text-error">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{viewer.error}</p>
      </div>
    );
  }

  if (viewer.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-container-lowest">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-surface-container-lowest">
      <div className="flex flex-1 min-h-0">
        {/* PDF canvas area */}
        <div
          ref={viewer.scrollContainerRef}
          className="flex-1 overflow-auto p-4 flex flex-col items-center"
        >
          {viewer.scrollMode === 'continuous'
            ? renderedPages.map((page, idx) => (
                <div key={idx + 1} data-pdf-page={idx + 1}>
                  <PdfPageCanvas
                    page={page}
                    zoom={viewer.zoom}
                    pageNumber={idx + 1}
                    markers={sectionMarkersForPage(idx + 1)}
                    onMarkerClick={id => {
                      const s = sections.find(sec => sec.id === id);
                      if (s) handleGoToSection(s);
                    }}
                  />
                </div>
              ))
            : renderedPages[viewer.currentPage - 1] != null && (
                <PdfPageCanvas
                  page={renderedPages[viewer.currentPage - 1]}
                  zoom={viewer.zoom}
                  pageNumber={viewer.currentPage}
                  markers={sectionMarkersForPage(viewer.currentPage)}
                  onMarkerClick={id => {
                    const s = sections.find(sec => sec.id === id);
                    if (s) handleGoToSection(s);
                  }}
                />
              )}
        </div>

        {/* Section sidebar — only when sections are enabled */}
        {hasSections && sidebarOpen && (
          <div className="w-56 border-l border-outline-variant flex flex-col min-h-0 bg-surface">
            <PdfSectionPanel
              sections={sections}
              annotations={annotations}
              sectionProgress={sectionProgress}
              currentPage={viewer.currentPage}
              onGoToSection={handleGoToSection}
              onAddSection={onAddSection!}
              onRemoveSection={onRemoveSection!}
              onSetSectionStatus={onSetSectionStatus!}
              onAddAnnotation={onAddAnnotation!}
              onRemoveAnnotation={onRemoveAnnotation!}
            />
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-1 border-t border-outline-variant">
        {hasSections && (
          <button
            onClick={() => setSidebarOpen(p => !p)}
            className="p-2 hover:bg-surface-variant transition-colors flex-shrink-0"
            title="Toggle sections panel"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1">
          <PdfControls
            currentPage={viewer.currentPage}
            totalPages={viewer.totalPages}
            zoom={viewer.zoom}
            scrollMode={viewer.scrollMode}
            autoScrollSpeed={viewer.autoScrollSpeed}
            isAutoScrolling={viewer.isAutoScrolling}
            onPrevPage={() => viewer.goToPage(viewer.currentPage - 1)}
            onNextPage={() => viewer.goToPage(viewer.currentPage + 1)}
            onZoomIn={() => viewer.setZoom(viewer.zoom + 0.1)}
            onZoomOut={() => viewer.setZoom(viewer.zoom - 0.1)}
            onToggleScrollMode={() =>
              viewer.setScrollMode(viewer.scrollMode === 'continuous' ? 'single' : 'continuous')
            }
            onToggleAutoScroll={viewer.toggleAutoScroll}
            onAutoScrollSpeedChange={viewer.setAutoScrollSpeed}
            onHalfPageAdvance={viewer.halfPageAdvance}
          />
        </div>
      </div>
    </div>
  );
}
