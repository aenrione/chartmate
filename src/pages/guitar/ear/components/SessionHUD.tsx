// src/pages/guitar/ear/components/SessionHUD.tsx
import {Flame} from 'lucide-react';

interface Props {
  exerciseName: string;
  questionIndex: number;
  totalQuestions: number;
  score: number;
  streak: number;
  elapsedMs: number;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

export function SessionHUD({exerciseName, questionIndex, totalQuestions, score, streak, elapsedMs}: Props) {
  const progress = totalQuestions > 0 ? (questionIndex / totalQuestions) * 100 : 0;

  return (
    <div className="sticky top-0 z-10 bg-surface/90 backdrop-blur-sm border-b border-surface-container-high">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-on-surface">{exerciseName}</span>
          <span className="text-xs text-on-surface-variant">
            {questionIndex} / {totalQuestions}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {streak > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <Flame className="h-4 w-4" />
              {streak}
            </span>
          )}
          <span className="font-mono text-on-surface-variant">{formatTime(elapsedMs)}</span>
          <span className="font-semibold text-primary">{score.toLocaleString()}</span>
        </div>
      </div>
      <div className="h-0.5 bg-surface-container-high">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{width: `${progress}%`}}
        />
      </div>
    </div>
  );
}
