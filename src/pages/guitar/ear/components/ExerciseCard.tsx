// src/pages/guitar/ear/components/ExerciseCard.tsx
import {useNavigate} from 'react-router-dom';
import {
  ArrowUpDown,
  Music,
  Music2,
  TrendingUp,
  Hash,
  ListMusic,
  ScanLine,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type {ExerciseDescriptor} from '../exercises/types';

const ICON_MAP: Record<string, LucideIcon> = {
  ArrowUpDown,
  Music,
  Music2,
  TrendingUp,
  Hash,
  ListMusic,
  ScanLine,
  Waves,
};

const DIFFICULTY_COLORS = {
  beginner: 'text-green-400 bg-green-400/10',
  intermediate: 'text-amber-400 bg-amber-400/10',
  advanced: 'text-red-400 bg-red-400/10',
} as const;

interface Props {
  descriptor: ExerciseDescriptor;
  bestAccuracy: number | null;
}

export function ExerciseCard({descriptor, bestAccuracy}: Props) {
  const navigate = useNavigate();
  const Icon: LucideIcon = ICON_MAP[descriptor.icon] ?? Music;

  return (
    <button
      onClick={() => navigate(`/guitar/ear/session/${descriptor.type}`)}
      className="group relative flex flex-col gap-3 rounded-3xl bg-surface-container p-5 text-left transition-all duration-200 hover:bg-surface-container-high hover:scale-[1.02] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-container-highest text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[descriptor.difficulty]}`}>
          {descriptor.difficulty}
        </span>
      </div>

      <div>
        <p className="font-semibold text-on-surface">{descriptor.name}</p>
        <p className="mt-0.5 text-xs text-on-surface-variant leading-snug">{descriptor.description}</p>
      </div>

      {bestAccuracy !== null && (
        <p className="text-xs text-on-surface-variant">
          Best: <span className="font-semibold text-on-surface">{Math.round(bestAccuracy * 100)}%</span>
        </p>
      )}
    </button>
  );
}
