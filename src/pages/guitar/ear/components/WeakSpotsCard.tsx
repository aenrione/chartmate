// src/pages/guitar/ear/components/WeakSpotsCard.tsx
import {useNavigate} from 'react-router-dom';
import type {EarItemStats} from '@/lib/local-db/ear-training';

interface Props {
  stats: EarItemStats[];
  limit?: number;
}

const EXERCISE_LABELS: Record<string, string> = {
  'interval-recognition': 'Interval',
  'chord-recognition': 'Chord',
  'perfect-pitch': 'Pitch',
  'scale-recognition': 'Scale',
  'scale-degrees': 'Degree',
  'chord-progressions': 'Progression',
  'intervals-in-context': 'Interval (ctx)',
  'melodic-dictation': 'Melody',
};

export function WeakSpotsCard({stats, limit = 3}: Props) {
  const navigate = useNavigate();
  const worst = [...stats]
    .filter(s => s.totalAttempts >= 3)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);

  if (worst.length === 0) return null;

  return (
    <div className="rounded-3xl bg-surface-container p-5">
      <h3 className="text-sm font-semibold text-on-surface mb-3">Weak Spots</h3>
      <div className="flex flex-col gap-2">
        {worst.map(s => (
          <div key={`${s.exerciseType}-${s.promptItem}`} className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm text-on-surface">{s.promptItem}</p>
              <p className="text-xs text-on-surface-variant">
                {EXERCISE_LABELS[s.exerciseType]} — {Math.round(s.accuracy * 100)}%
              </p>
            </div>
            <button
              onClick={() => navigate(`/guitar/ear/session/${s.exerciseType}`)}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20"
            >
              Practice
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
