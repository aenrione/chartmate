import {useState} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {cn} from '@/lib/utils';
import {usePlaybook} from './PlaybookProvider';
import type {ProgressStatus} from '@/lib/local-db/playbook';

const STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: 'Not Started',
  needs_work: 'Needs Work',
  practicing: 'Practicing',
  nailed_it: 'Nailed It',
};

export default function ChartViewer() {
  const {activeItem, speed, songStatus, loopSectionId, sections} = usePlaybook();
  const [hoverEdge, setHoverEdge] = useState<'left' | 'right' | null>(null);

  if (!activeItem) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-container-lowest text-outline text-sm">
        No song selected
      </div>
    );
  }

  const loopSection = loopSectionId !== null
    ? sections.find(s => s.id === loopSectionId)
    : null;

  return (
    <div className="flex-1 relative bg-surface-container-lowest overflow-hidden">
      {/* Loop overlay */}
      {loopSection && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 glass-panel ghost-border rounded-full px-3 py-1 flex items-center gap-2">
          <span className="text-xs font-mono text-on-surface-variant">
            Looping: {loopSection.name}
          </span>
        </div>
      )}

      {/* Page-turn affordances */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-16 z-10 flex items-center justify-center transition-opacity cursor-pointer',
          hoverEdge === 'left' ? 'opacity-100' : 'opacity-0',
        )}
        onMouseEnter={() => setHoverEdge('left')}
        onMouseLeave={() => setHoverEdge(null)}
      >
        <div className="glass-panel rounded-full p-2">
          <ChevronLeft className="h-5 w-5 text-on-surface-variant" />
        </div>
      </div>
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-16 z-10 flex items-center justify-center transition-opacity cursor-pointer',
          hoverEdge === 'right' ? 'opacity-100' : 'opacity-0',
        )}
        onMouseEnter={() => setHoverEdge('right')}
        onMouseLeave={() => setHoverEdge(null)}
      >
        <div className="glass-panel rounded-full p-2">
          <ChevronRight className="h-5 w-5 text-on-surface-variant" />
        </div>
      </div>

      {/* Placeholder content */}
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3 max-w-sm">
          <div className="h-24 w-24 mx-auto rounded-2xl bg-surface-container flex items-center justify-center">
            <span className="text-3xl">🎵</span>
          </div>
          <h3 className="text-lg font-headline font-bold text-on-surface">
            {activeItem.name}
          </h3>
          <p className="text-sm text-on-surface-variant">{activeItem.artist}</p>
          <div className="flex items-center justify-center gap-4 text-xs text-on-surface-variant">
            <span className="font-mono">Speed: {speed}%</span>
            <span>Status: {STATUS_LABEL[songStatus]}</span>
          </div>
          <p className="text-[10px] font-mono text-outline break-all">
            MD5: {activeItem.chartMd5}
          </p>
          <p className="text-xs text-outline mt-4">
            Chart rendering will appear here in a future update.
          </p>
        </div>
      </div>
    </div>
  );
}
