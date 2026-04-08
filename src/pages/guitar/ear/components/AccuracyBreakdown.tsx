// src/pages/guitar/ear/components/AccuracyBreakdown.tsx
import type {EarItemStats} from '@/lib/local-db/ear-training';

interface Props {
  stats: EarItemStats[];
}

// Group stats by exercise type and compute overall accuracy per exercise
function groupByExercise(stats: EarItemStats[]) {
  const map = new Map<string, {correct: number; total: number}>();
  for (const s of stats) {
    const ex = s.exerciseType;
    const cur = map.get(ex) ?? {correct: 0, total: 0};
    map.set(ex, {correct: cur.correct + s.correctAttempts, total: cur.total + s.totalAttempts});
  }
  return Array.from(map.entries()).map(([type, {correct, total}]) => ({
    type,
    accuracy: total > 0 ? correct / total : 0,
    total,
  }));
}

const EXERCISE_LABELS: Record<string, string> = {
  'interval-recognition': 'Interval Recognition',
  'chord-recognition': 'Chord Recognition',
  'perfect-pitch': 'Perfect Pitch',
  'scale-recognition': 'Scale Recognition',
  'scale-degrees': 'Scale Degrees',
  'chord-progressions': 'Chord Progressions',
  'intervals-in-context': 'Intervals in Context',
  'melodic-dictation': 'Melodic Dictation',
};

export function AccuracyBreakdown({stats}: Props) {
  const grouped = groupByExercise(stats);
  if (grouped.length === 0) return <p className="text-sm text-on-surface-variant">No data yet. Start practicing!</p>;

  return (
    <div className="flex flex-col gap-3">
      {grouped.map(({type, accuracy}) => {
        const barColor = accuracy >= 0.75 ? 'bg-green-500' : accuracy >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
        return (
          <div key={type} className="flex items-center gap-3">
            <span className="w-44 shrink-0 text-sm text-on-surface-variant truncate">
              {EXERCISE_LABELS[type] ?? type}
            </span>
            <div className="relative flex-1 h-3 rounded-full bg-surface-container-high overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{width: `${accuracy * 100}%`}} />
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-mono text-on-surface">
              {Math.round(accuracy * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
