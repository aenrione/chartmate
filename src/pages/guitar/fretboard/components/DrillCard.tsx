import {Search, Ruler, Route, Layers, Grid3X3, Hexagon, ArrowRight} from 'lucide-react';
import type {DrillDescriptor} from '../drills/types';
import type {DrillType} from '@/lib/local-db/fretboard';

interface DrillCardProps {
  drill: DrillDescriptor;
  bestScore?: string;
  onClick: () => void;
}

const DIFFICULTY_STYLES = {
  beginner: 'text-primary',
  intermediate: 'text-tertiary',
  advanced: 'text-error',
} as const;

const DRILL_ICONS: Record<DrillType, React.ReactNode> = {
  'note-finder': <Search className="h-5 w-5" />,
  'interval-spotter': <Ruler className="h-5 w-5" />,
  'scale-navigator': <Route className="h-5 w-5" />,
  'chord-tone-finder': <Layers className="h-5 w-5" />,
  'octave-mapper': <Grid3X3 className="h-5 w-5" />,
  'caged-shapes': <Hexagon className="h-5 w-5" />,
};

export default function DrillCard({drill, bestScore, onClick}: DrillCardProps) {
  return (
    <button
      onClick={onClick}
      className="group bg-surface-container-low p-4 lg:p-6 rounded-xl border border-outline-variant/10 hover:bg-surface-container transition-all duration-300 hover:scale-[1.02] relative overflow-hidden text-left w-full"
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-8 -mt-8 group-hover:bg-primary/10 transition-colors" />

      <div className="flex items-start justify-between mb-2 lg:mb-4">
        <div className="p-2 lg:p-3 bg-secondary-container/10 rounded-lg text-secondary-container">
          {DRILL_ICONS[drill.type]}
        </div>
        <span className={`text-[9px] lg:text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 lg:py-1 bg-surface-container-high rounded ${DIFFICULTY_STYLES[drill.difficulty]}`}>
          {drill.difficulty}
        </span>
      </div>

      <h3 className="text-sm lg:text-lg font-bold text-on-surface mb-0.5 lg:mb-1">{drill.name}</h3>
      <p className="text-xs lg:text-sm text-on-surface-variant mb-3 lg:mb-6 line-clamp-2">{drill.description}</p>

      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <span className="text-[9px] lg:text-[10px] uppercase text-on-surface-variant font-mono">Best Score</span>
          <span className="text-base lg:text-xl font-mono font-bold text-on-surface">{bestScore ?? '--'}</span>
        </div>
        <ArrowRight className="h-4 w-4 lg:h-5 lg:w-5 text-secondary-container opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}
