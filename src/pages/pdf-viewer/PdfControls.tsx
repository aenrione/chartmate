import {ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Play, Pause, ChevronsDown} from 'lucide-react';
import type {ScrollMode} from '@/hooks/usePdfViewer';

type Props = {
  currentPage: number;
  totalPages: number;
  zoom: number;
  scrollMode: ScrollMode;
  autoScrollSpeed: number;
  isAutoScrolling: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleScrollMode: () => void;
  onToggleAutoScroll: () => void;
  onAutoScrollSpeedChange: (speed: number) => void;
  onHalfPageAdvance: () => void;
};

export default function PdfControls({
  currentPage,
  totalPages,
  zoom,
  scrollMode,
  autoScrollSpeed,
  isAutoScrolling,
  onPrevPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onToggleScrollMode,
  onToggleAutoScroll,
  onAutoScrollSpeedChange,
  onHalfPageAdvance,
}: Props) {
  const displaySpeed = autoScrollSpeed || 60;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2
                    bg-surface border-t border-outline-variant text-sm flex-wrap">

      {/* Page navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPrevPage}
          disabled={currentPage <= 1}
          className="p-1.5 rounded hover:bg-surface-variant disabled:opacity-30 transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-on-surface-variant min-w-[60px] text-center">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={onNextPage}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded hover:bg-surface-variant disabled:opacity-30 transition-colors"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded hover:bg-surface-variant transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-on-surface-variant min-w-[40px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded hover:bg-surface-variant transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>

      {/* Scroll mode */}
      <button
        onClick={onToggleScrollMode}
        className="px-2 py-1 rounded text-xs font-mono hover:bg-surface-variant transition-colors"
        title="Toggle scroll mode"
      >
        {scrollMode === 'continuous' ? 'Continuous' : 'Single Page'}
      </button>

      {/* Half-page advance */}
      <button
        onClick={onHalfPageAdvance}
        className="p-1.5 rounded hover:bg-surface-variant transition-colors"
        title="Half-page advance (sight-reading)"
      >
        <ChevronsDown className="h-4 w-4" />
      </button>

      {/* Auto-scroll */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleAutoScroll}
          className="p-1.5 rounded hover:bg-surface-variant transition-colors"
          title={isAutoScrolling ? 'Pause auto-scroll' : 'Start auto-scroll'}
        >
          {isAutoScrolling
            ? <Pause className="h-4 w-4 text-primary" />
            : <Play className="h-4 w-4" />
          }
        </button>
        <input
          type="range"
          min={10}
          max={300}
          step={10}
          value={displaySpeed}
          onChange={e => onAutoScrollSpeedChange(Number(e.target.value))}
          className="w-20 accent-primary"
          title={`Auto-scroll speed: ${displaySpeed} px/sec`}
        />
        <span className="font-mono text-xs text-on-surface-variant w-14">
          {displaySpeed} px/s
        </span>
      </div>
    </div>
  );
}
