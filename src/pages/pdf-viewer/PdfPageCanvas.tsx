import {useEffect, useRef, memo} from 'react';
import type {PDFPageProxy} from 'pdfjs-dist';

type SectionMarker = {
  id: number;
  name: string;
  yOffset: number; // 0–1 normalized (fraction of page height)
};

type Props = {
  page: PDFPageProxy;
  zoom: number;
  pageNumber: number;
  markers?: SectionMarker[];
  onMarkerClick?: (sectionId: number) => void;
};

export default memo(function PdfPageCanvas({
  page,
  zoom,
  pageNumber,
  markers = [],
  onMarkerClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewport = page.getViewport({scale: zoom});
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderTask = page.render({canvas, viewport});

    return () => {
      renderTask.cancel();
    };
  }, [page, zoom]);

  return (
    <div className="relative" style={{marginBottom: '8px'}}>
      <canvas ref={canvasRef} className="block shadow-sm" />

      {markers.map(marker => (
        <button
          key={marker.id}
          className="absolute left-0 right-0 flex items-center gap-1 px-2 py-0.5 text-xs font-mono
                     bg-primary/20 border-l-2 border-primary text-on-surface hover:bg-primary/40
                     transition-colors cursor-pointer"
          style={{top: `${marker.yOffset * 100}%`}}
          onClick={() => onMarkerClick?.(marker.id)}
          title={marker.name}
        >
          <span className="truncate">{marker.name}</span>
        </button>
      ))}

      <div className="absolute bottom-2 right-2 text-xs font-mono text-on-surface-variant
                      bg-surface/80 px-1.5 py-0.5 rounded pointer-events-none">
        {pageNumber}
      </div>
    </div>
  );
});
